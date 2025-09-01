/**
 * WebtoMD UI Components - 用户界面组件
 * 实现跨平台的UI组件和管理功能
 */

/**
 * 平台适配器 - 处理不同操作系统的差异
 */
class PlatformAdapter {
  constructor() {
    this.platform = this.detectPlatform();
    this.init();
  }

  /**
   * 检测当前平台
   * @returns {string} 平台名称
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
   * 初始化平台适配
   */
  init() {
    // 添加平台特定的CSS类
    document.body.classList.add(`platform-${this.platform}`);
    
    // 更新快捷键提示
    this.updateShortcutHints();
    
    console.log(`Platform detected: ${this.platform}`);
  }

  /**
   * 判断是否为Mac平台
   * @returns {boolean}
   */
  isMac() {
    return this.platform === 'mac';
  }

  /**
   * 获取修饰键符号
   * @returns {string} 修饰键符号
   */
  getModifierKey() {
    return this.isMac() ? '⌘' : 'Ctrl';
  }

  /**
   * 获取快捷键组合字符串
   * @returns {string} 快捷键字符串
   */
  getShortcutString() {
    return `${this.getModifierKey()} + Shift + S`;
  }

  /**
   * 更新界面中的快捷键提示
   */
  updateShortcutHints() {
    const shortcutElements = document.querySelectorAll('.shortcut-hint, .shortcut');
    const shortcutString = this.getShortcutString();
    
    shortcutElements.forEach(element => {
      if (element.textContent.includes('Ctrl/Cmd')) {
        element.textContent = element.textContent.replace(
          /Ctrl\/Cmd.*?S/g, 
          shortcutString
        );
      }
    });
  }

  /**
   * 获取平台特定的右键菜单配置
   * @returns {Object} 菜单配置
   */
  getContextMenuConfig() {
    return {
      mac: {
        trigger: 'Control + 点击 或 双指轻触',
        style: 'mac-context-menu'
      },
      windows: {
        trigger: '右键点击',
        style: 'windows-context-menu'
      },
      linux: {
        trigger: '右键点击',
        style: 'linux-context-menu'
      }
    }[this.platform] || {
      trigger: '右键点击',
      style: 'default-context-menu'
    };
  }
}

/**
 * 上下文菜单管理器
 */
class ContextMenuManager {
  constructor() {
    this.menuItems = {
      main: 'webtomd-main',
      new: 'webtomd-save-new',
      append: 'webtomd-append'
    };
    this.platformAdapter = new PlatformAdapter();
  }

  /**
   * 创建上下文菜单
   */
  createMenus() {
    // 清除现有菜单
    chrome.contextMenus.removeAll(() => {
      // 主菜单项
      chrome.contextMenus.create({
        id: this.menuItems.main,
        title: '保存为 Markdown',
        contexts: ['selection'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      });

      // 子菜单 - 新建文档保存
      chrome.contextMenus.create({
        id: this.menuItems.new,
        parentId: this.menuItems.main,
        title: '新建文档保存',
        contexts: ['selection']
      });

      // 子菜单 - 附加到现有文档
      chrome.contextMenus.create({
        id: this.menuItems.append,
        parentId: this.menuItems.main,
        title: '附加到现有文档',
        contexts: ['selection']
      });

      console.log('Context menus created with platform adaptation');
    });
  }

  /**
   * 处理菜单点击事件
   * @param {Object} info 菜单信息
   * @param {Object} tab 标签页信息
   * @param {Function} callback 回调函数
   */
  handleMenuClick(info, tab, callback) {
    if (!info.menuItemId.startsWith('webtomd-')) {
      return;
    }

    const saveMode = info.menuItemId === this.menuItems.new ? 'new' : 'append';
    
    // 显示处理开始通知
    this.showProcessingNotification();
    
    // 执行回调
    if (callback && typeof callback === 'function') {
      callback(saveMode);
    }
  }

  /**
   * 显示处理中通知
   */
  showProcessingNotification() {
    // 向当前页面发送通知消息
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showInPageNotification',
          type: 'info',
          message: '正在处理选中内容...'
        }).catch(() => {
          // 忽略错误，content script可能未加载
        });
      }
    });
  }
}

/**
 * 通知管理器
 */
class NotificationManager {
  constructor() {
    this.defaultOptions = {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'WebtoMD'
    };
    this.notificationQueue = [];
    this.isProcessing = false;
  }

  /**
   * 显示成功通知
   * @param {string} message 通知消息
   * @param {Object} options 通知选项
   */
  showSuccess(message, options = {}) {
    this.addToQueue({
      ...this.defaultOptions,
      ...options,
      message,
      priority: 0,
      type: 'success'
    });
  }

  /**
   * 显示信息通知
   * @param {string} message 通知消息
   * @param {Object} options 通知选项
   */
  showInfo(message, options = {}) {
    this.addToQueue({
      ...this.defaultOptions,
      ...options,
      message,
      priority: 1,
      type: 'info'
    });
  }

  /**
   * 显示错误通知
   * @param {string} error 错误消息
   * @param {Object} options 通知选项
   */
  showError(error, options = {}) {
    this.addToQueue({
      ...this.defaultOptions,
      ...options,
      message: `操作失败: ${error}`,
      priority: 2,
      type: 'error'
    });
  }

  /**
   * 显示进度通知
   * @param {string} message 进度消息
   * @param {number} progress 进度百分比 (0-100)
   */
  showProgress(message, progress) {
    const progressMessage = `${message} (${progress}%)`;
    this.showInfo(progressMessage);
  }

  /**
   * 添加通知到队列
   * @param {Object} notification 通知对象
   */
  addToQueue(notification) {
    this.notificationQueue.push({
      ...notification,
      id: Date.now() + Math.random(),
      timestamp: Date.now()
    });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理通知队列
   */
  async processQueue() {
    if (this.notificationQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    
    // 按优先级排序
    this.notificationQueue.sort((a, b) => b.priority - a.priority);
    
    const notification = this.notificationQueue.shift();
    
    try {
      // 尝试使用Chrome通知API
      if (chrome.notifications) {
        await this.showChromeNotification(notification);
      } else {
        // 降级到页面内通知
        await this.showInPageNotification(notification);
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
      // 降级到控制台输出
      console.log(`Notification: ${notification.message}`);
    }

    // 延迟后处理下一个通知
    setTimeout(() => {
      this.processQueue();
    }, 1000);
  }

  /**
   * 显示Chrome系统通知
   * @param {Object} notification 通知对象
   */
  async showChromeNotification(notification) {
    return new Promise((resolve, reject) => {
      const options = {
        type: notification.type === 'progress' ? 'progress' : 'basic',
        iconUrl: notification.iconUrl,
        title: notification.title,
        message: notification.message
      };

      if (notification.progress !== undefined) {
        options.progress = notification.progress;
      }

      chrome.notifications.create(notification.id.toString(), options, (notificationId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          // 自动清除通知
          setTimeout(() => {
            chrome.notifications.clear(notificationId);
          }, notification.type === 'error' ? 5000 : 3000);
          resolve(notificationId);
        }
      });
    });
  }

  /**
   * 显示页面内通知
   * @param {Object} notification 通知对象
   */
  async showInPageNotification(notification) {
    // 向当前活动标签页发送通知消息
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showInPageNotification',
          notification: notification
        }).catch(() => {
          // 忽略错误，content script可能未加载
          console.log(`In-page notification: ${notification.message}`);
        });
      }
    });
  }

  /**
   * 清除所有通知
   */
  clearAll() {
    this.notificationQueue = [];
    if (chrome.notifications) {
      chrome.notifications.getAll((notifications) => {
        Object.keys(notifications).forEach(id => {
          chrome.notifications.clear(id);
        });
      });
    }
  }
}

/**
 * 状态管理器
 */
class StatusManager {
  constructor() {
    this.currentStatus = 'idle';
    this.statusHistory = [];
    this.listeners = [];
  }

  /**
   * 设置状态
   * @param {string} status 状态名称
   * @param {Object} data 状态数据
   */
  setStatus(status, data = {}) {
    const previousStatus = this.currentStatus;
    this.currentStatus = status;
    
    const statusData = {
      status,
      data,
      timestamp: Date.now(),
      previous: previousStatus
    };

    this.statusHistory.push(statusData);
    
    // 限制历史记录长度
    if (this.statusHistory.length > 100) {
      this.statusHistory = this.statusHistory.slice(-50);
    }

    // 通知监听器
    this.notifyListeners(statusData);
    
    console.log(`Status changed: ${previousStatus} -> ${status}`, data);
  }

  /**
   * 获取当前状态
   * @returns {string} 当前状态
   */
  getStatus() {
    return this.currentStatus;
  }

  /**
   * 检查是否为指定状态
   * @param {string} status 要检查的状态
   * @returns {boolean} 是否匹配
   */
  isStatus(status) {
    return this.currentStatus === status;
  }

  /**
   * 添加状态监听器
   * @param {Function} listener 监听器函数
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 移除状态监听器
   * @param {Function} listener 监听器函数
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   * @param {Object} statusData 状态数据
   */
  notifyListeners(statusData) {
    this.listeners.forEach(listener => {
      try {
        listener(statusData);
      } catch (error) {
        console.error('Status listener error:', error);
      }
    });
  }

  /**
   * 获取状态历史
   * @param {number} limit 限制数量
   * @returns {Array} 状态历史
   */
  getHistory(limit = 10) {
    return this.statusHistory.slice(-limit);
  }
}

/**
 * UI主题管理器
 */
class ThemeManager {
  constructor() {
    this.currentTheme = 'auto';
    this.systemTheme = this.detectSystemTheme();
    this.init();
  }

  /**
   * 检测系统主题
   * @returns {string} 系统主题
   */
  detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 初始化主题管理
   */
  init() {
    // 监听系统主题变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemTheme = e.matches ? 'dark' : 'light';
        if (this.currentTheme === 'auto') {
          this.applyTheme();
        }
      });
    }

    // 应用初始主题
    this.applyTheme();
  }

  /**
   * 设置主题
   * @param {string} theme 主题名称 ('light', 'dark', 'auto')
   */
  setTheme(theme) {
    this.currentTheme = theme;
    this.applyTheme();
    
    // 保存到存储
    chrome.storage.local.set({ theme: theme });
  }

  /**
   * 应用主题
   */
  applyTheme() {
    const effectiveTheme = this.currentTheme === 'auto' ? this.systemTheme : this.currentTheme;
    
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${effectiveTheme}`);
    
    console.log(`Applied theme: ${effectiveTheme} (requested: ${this.currentTheme})`);
  }

  /**
   * 获取当前生效的主题
   * @returns {string} 当前主题
   */
  getEffectiveTheme() {
    return this.currentTheme === 'auto' ? this.systemTheme : this.currentTheme;
  }
}

// 导出组件类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PlatformAdapter,
    ContextMenuManager,
    NotificationManager,
    StatusManager,
    ThemeManager
  };
}