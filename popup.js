/**
 * WebtoMD Popup Script - 弹窗界面逻辑
 * 处理扩展弹窗的用户交互，集成平台适配和主题管理
 */

class WebtoMDPopup {
  constructor() {
    this.platformAdapter = null;
    this.themeManager = null;
    this.statusManager = null;
    this.currentTheme = 'auto';
    this.init();
  }

  /**
   * 初始化弹窗
   */
  async init() {
    // 初始化平台适配
    this.initPlatformAdapter();
    
    // 初始化主题管理
    await this.initThemeManager();
    
    // 初始化状态管理
    this.initStatusManager();
    
    // 绑定按钮事件
    this.bindEvents();
    
    // 检查是否有已选中的内容
    this.checkSelectedContent();
    
    // 更新状态栏
    this.updateStatusBar();

    console.log('WebtoMD Popup initialized');
  }

  /**
   * 初始化平台适配器
   */
  initPlatformAdapter() {
    this.platformAdapter = {
      platform: this.detectPlatform(),
      getModifierKey: () => {
        return this.platformAdapter.platform === 'mac' ? '⌘' : 'Ctrl';
      },
      getShortcutString: () => {
        return `${this.platformAdapter.getModifierKey()} + Shift + S`;
      },
      getContextMenuHint: () => {
        if (this.platformAdapter.platform === 'mac') {
          return 'Control + 点击 或 双指轻触选择保存选项';
        }
        return '右键点击选择保存选项';
      }
    };

    // 添加平台CSS类
    document.body.classList.add(`platform-${this.platformAdapter.platform}`);
    
    // 更新界面文本
    document.getElementById('shortcutDisplay').textContent = this.platformAdapter.getShortcutString();
    document.getElementById('contextMenuHint').textContent = this.platformAdapter.getContextMenuHint();
    document.getElementById('platformIndicator').textContent = this.platformAdapter.platform.toUpperCase();
  }

  /**
   * 检测平台
   */
  detectPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();
    
    if (platform.includes('mac') || userAgent.includes('macintosh')) {
      return 'mac';
    } else if (platform.includes('win') || userAgent.includes('windows')) {
      return 'windows';
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      return 'linux';
    } else {
      return 'unknown';
    }
  }

  /**
   * 初始化主题管理
   */
  async initThemeManager() {
    // 从存储中获取主题设置
    const result = await chrome.storage.local.get(['theme']);
    this.currentTheme = result.theme || 'auto';
    
    this.themeManager = {
      currentTheme: this.currentTheme,
      systemTheme: this.detectSystemTheme(),
      setTheme: (theme) => {
        this.currentTheme = theme;
        this.applyTheme();
        chrome.storage.local.set({ theme: theme });
      },
      getEffectiveTheme: () => {
        return this.currentTheme === 'auto' ? this.themeManager.systemTheme : this.currentTheme;
      }
    };

    // 监听系统主题变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.themeManager.systemTheme = e.matches ? 'dark' : 'light';
        if (this.currentTheme === 'auto') {
          this.applyTheme();
        }
      });
    }

    // 应用初始主题
    this.applyTheme();
  }

  /**
   * 检测系统主题
   */
  detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 应用主题
   */
  applyTheme() {
    const effectiveTheme = this.themeManager.getEffectiveTheme();
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${effectiveTheme}`);
  }

  /**
   * 初始化状态管理
   */
  initStatusManager() {
    this.statusManager = {
      currentStatus: 'idle',
      setStatus: (status, data = {}) => {
        this.statusManager.currentStatus = status;
        this.updateStatusBar(status, data);
      },
      getStatus: () => this.statusManager.currentStatus
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 主要操作按钮
    document.getElementById('saveNew').addEventListener('click', () => {
      this.handleSave('new');
    });

    document.getElementById('appendExisting').addEventListener('click', () => {
      this.handleSave('append');
    });

    // 快速操作按钮
    document.getElementById('clearHistory').addEventListener('click', () => {
      this.handleClearHistory();
    });

    document.getElementById('showStatus').addEventListener('click', () => {
      this.handleShowStatus();
    });

    document.getElementById('toggleTheme').addEventListener('click', () => {
      this.handleToggleTheme();
    });

    // 键盘事件
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        window.close();
      }
    });
  }

  /**
   * 处理保存操作
   * @param {string} mode 保存模式 ('new' 或 'append')
   */
  async handleSave(mode) {
    try {
      this.statusManager.setStatus('getting-content');
      this.showStatus('正在获取选中内容...', 'info');
      this.setLoading(true);

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('无法获取当前标签页');
      }

      // 向content script请求选中内容
      chrome.tabs.sendMessage(tab.id, { 
        action: 'getSelectedContent' 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to get selected content:', chrome.runtime.lastError);
          this.showStatus('无法获取选中内容，请确保已选中文本', 'error');
          this.setLoading(false);
          return;
        }

        if (response && response.success) {
          this.statusManager.setStatus('processing');
          // 发送到background script处理
          chrome.runtime.sendMessage({
            action: 'processSelectedContent',
            data: response.data,
            saveMode: mode
          }, (bgResponse) => {
            this.setLoading(false);
            if (bgResponse && bgResponse.success) {
              this.statusManager.setStatus('completed');
              this.showStatus('内容处理完成，正在保存...', 'success');
              // 延迟关闭弹窗
              setTimeout(() => {
                window.close();
              }, 2000);
            } else {
              this.statusManager.setStatus('error');
              this.showStatus(bgResponse?.error || '处理失败', 'error');
            }
          });
        } else {
          this.setLoading(false);
          this.statusManager.setStatus('error');
          this.showStatus(response?.error || '请先选中要转换的内容', 'error');
        }
      });

    } catch (error) {
      console.error('Save operation error:', error);
      this.setLoading(false);
      this.statusManager.setStatus('error');
      this.showStatus(error.message, 'error');
    }
  }

  /**
   * 处理清理历史
   */
  async handleClearHistory() {
    try {
      await chrome.storage.local.remove(['saveHistory']);
      this.showStatus('历史记录已清理', 'success');
    } catch (error) {
      this.showStatus('清理失败: ' + error.message, 'error');
    }
  }

  /**
   * 处理显示状态
   */
  async handleShowStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
      if (response && response.success) {
        const statusText = `状态: ${response.status}`;
        this.showStatus(statusText, 'info');
        document.getElementById('statusText').textContent = statusText;
        document.getElementById('statusBar').classList.remove('hidden');
      }
    } catch (error) {
      this.showStatus('无法获取状态', 'error');
    }
  }

  /**
   * 处理主题切换
   */
  handleToggleTheme() {
    const themes = ['auto', 'light', 'dark'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    
    this.themeManager.setTheme(nextTheme);
    this.showStatus(`主题切换为: ${nextTheme}`, 'info');
  }

  /**
   * 检查是否有已选中的内容
   */
  async checkSelectedContent() {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) return;

      // 检查页面是否支持content script
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        this.showStatus('当前页面不支持内容选择', 'info');
        this.disableButtons();
        return;
      }

      // 尝试与content script通信
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script可能还没有加载，这是正常的
          console.log('Content script not ready yet');
        } else {
          this.statusManager.setStatus('ready');
        }
      });

    } catch (error) {
      console.error('Check selected content error:', error);
    }
  }

  /**
   * 更新状态栏
   * @param {string} status 状态
   * @param {Object} data 状态数据
   */
  updateStatusBar(status = 'ready', data = {}) {
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    
    const statusMap = {
      'idle': '就绪',
      'ready': '准备就绪',
      'getting-content': '获取内容中...',
      'processing': '处理中...',
      'completed': '已完成',
      'error': '出现错误'
    };

    statusText.textContent = statusMap[status] || status;
    statusBar.classList.remove('hidden');
  }

  /**
   * 显示状态信息
   * @param {string} message 状态消息
   * @param {string} type 状态类型 ('info', 'success', 'error')
   */
  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    
    // 清除之前的状态类
    statusElement.className = 'status';
    statusElement.classList.add(`status-${type}`);
    statusElement.textContent = message;
    statusElement.classList.remove('hidden');

    // 如果是错误或成功消息，几秒后自动隐藏
    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        statusElement.classList.add('hidden');
      }, type === 'error' ? 4000 : 2000);
    }
  }

  /**
   * 设置加载状态
   * @param {boolean} loading 是否加载中
   */
  setLoading(loading) {
    const buttons = document.querySelectorAll('.button');
    const quickActions = document.querySelectorAll('.quick-action');
    
    if (loading) {
      document.body.classList.add('loading');
      buttons.forEach(button => button.disabled = true);
      quickActions.forEach(action => action.disabled = true);
    } else {
      document.body.classList.remove('loading');
      buttons.forEach(button => button.disabled = false);
      quickActions.forEach(action => action.disabled = false);
    }
  }

  /**
   * 禁用按钮
   */
  disableButtons() {
    document.getElementById('saveNew').disabled = true;
    document.getElementById('appendExisting').disabled = true;
    
    // 添加视觉反馈
    const buttons = document.querySelectorAll('.button');
    buttons.forEach(button => {
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';
    });
  }

  /**
   * 启用按钮
   */
  enableButtons() {
    document.getElementById('saveNew').disabled = false;
    document.getElementById('appendExisting').disabled = false;
    
    // 恢复视觉状态
    const buttons = document.querySelectorAll('.button');
    buttons.forEach(button => {
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    });
  }

  /**
   * 获取保存历史
   */
  async getSaveHistory() {
    try {
      const result = await chrome.storage.local.get(['saveHistory']);
      return result.saveHistory || [];
    } catch (error) {
      console.error('Failed to get save history:', error);
      return [];
    }
  }

  /**
   * 显示历史记录
   */
  async showHistory() {
    const history = await this.getSaveHistory();
    if (history.length === 0) {
      this.showStatus('暂无保存历史', 'info');
      return;
    }

    const recentSave = history[0];
    const message = `最近保存: ${recentSave.fileName} (${new Date(recentSave.timestamp).toLocaleString()})`;
    this.showStatus(message, 'info');
  }
}

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new WebtoMDPopup();
});