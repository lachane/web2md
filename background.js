/**
 * WebtoMD Background Script - 后台服务
 * 处理扩展的核心逻辑和消息传递，集成文件保存功能和UI组件
 */

// 导入UI组件（注意：background script中不能直接使用import，需要内嵌或通过其他方式）

/**
 * 文件权限管理器
 */
class FilePermissionManager {
  constructor() {
    this.permissionCache = new Map();
  }

  async requestPermission(fileHandle) {
    try {
      const options = { mode: 'readwrite' };
      const currentPermission = await fileHandle.queryPermission(options);
      
      if (currentPermission === 'granted') {
        return true;
      }

      const newPermission = await fileHandle.requestPermission(options);
      return newPermission === 'granted';
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }
}

/**
 * 后台通知管理器
 */
class BackgroundNotificationManager {
  constructor() {
    this.defaultOptions = {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'WebtoMD'
    };
  }

  /**
   * 显示成功通知
   */
  showSuccess(message, options = {}) {
    this.show({
      ...this.defaultOptions,
      ...options,
      message,
      priority: 0
    });
  }

  /**
   * 显示错误通知
   */
  showError(error, options = {}) {
    this.show({
      ...this.defaultOptions,
      ...options,
      message: `操作失败: ${error}`,
      priority: 2
    });
  }

  /**
   * 显示信息通知
   */
  showInfo(message, options = {}) {
    this.show({
      ...this.defaultOptions,
      ...options,
      message,
      priority: 1
    });
  }

  /**
   * 显示通知
   */
  show(options) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: options.type || 'basic',
        iconUrl: options.iconUrl,
        title: options.title,
        message: options.message
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to create notification:', chrome.runtime.lastError);
          this.fallbackToInPageNotification(options);
        } else {
          // 自动清除通知
          setTimeout(() => {
            chrome.notifications.clear(notificationId);
          }, options.priority === 2 ? 5000 : 3000);
        }
      });
    } else {
      this.fallbackToInPageNotification(options);
    }
  }

  /**
   * 降级到页面内通知
   */
  fallbackToInPageNotification(options) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showInPageNotification',
          notification: options
        }).catch(() => {
          console.log(`Notification: ${options.message}`);
        });
      }
    });
  }
}

/**
 * 后台上下文菜单管理器
 */
class BackgroundContextMenuManager {
  constructor() {
    this.menuItems = {
      main: 'webtomd-main',
      new: 'webtomd-save-new',
      append: 'webtomd-append'
    };
  }

  /**
   * 创建上下文菜单
   */
  createMenus() {
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

      console.log('Context menus created');
    });
  }

  /**
   * 处理菜单点击
   */
  handleMenuClick(info, tab, callback) {
    if (!info.menuItemId.startsWith('webtomd-')) {
      return;
    }

    const saveMode = info.menuItemId === this.menuItems.new ? 'new' : 'append';
    
    // 显示处理开始通知
    chrome.tabs.sendMessage(tab.id, {
      action: 'showInPageNotification',
      type: 'info',
      message: '正在处理选中内容...'
    }).catch(() => {
      // 忽略错误
    });
    
    if (callback && typeof callback === 'function') {
      callback(saveMode);
    }
  }
}

/**
 * 后台状态管理器
 */
class BackgroundStatusManager {
  constructor() {
    this.currentStatus = 'idle';
    this.statusHistory = [];
  }

  /**
   * 设置状态
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
    if (this.statusHistory.length > 50) {
      this.statusHistory = this.statusHistory.slice(-25);
    }

    console.log(`Status changed: ${previousStatus} -> ${status}`, data);
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return this.currentStatus;
  }

  /**
   * 检查是否为指定状态
   */
  isStatus(status) {
    return this.currentStatus === status;
  }
}

/**
 * 文件处理器
 */
class FileHandler {
  constructor() {
    this.lastUsedMode = 'new';
    this.permissionManager = new FilePermissionManager();
  }

  async saveContent(markdown, options = {}, metadata = {}) {
    try {
      const {
        mode = this.lastUsedMode,
        fileName = this.generateFileName(metadata)
      } = options;

      console.log(`Starting file save in ${mode} mode`);

      let result;
      if (mode === 'new') {
        result = await this.saveNewFile(markdown, fileName, metadata);
      } else if (mode === 'append') {
        result = await this.appendToFile(markdown, metadata);
      } else {
        throw new Error(`不支持的保存模式: ${mode}`);
      }

      this.lastUsedMode = mode;
      await this.saveSaveHistory(result);

      console.log('File save completed successfully');
      return result;
    } catch (error) {
      console.error('File save failed:', error);
      throw new Error(`文件保存失败: ${error.message}`);
    }
  }

  generateFileName(metadata = {}) {
    try {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
      
      let pageTitle = metadata.title || 'WebtoMD';
      pageTitle = pageTitle
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 50);
      
      if (!pageTitle || pageTitle === '_') {
        pageTitle = 'WebtoMD_Export';
      }

      return `${pageTitle}_${timestamp}.md`;
    } catch (error) {
      console.error('Error generating filename:', error);
      return `WebtoMD_Export_${Date.now()}.md`;
    }
  }

  async saveNewFile(content, fileName, metadata = {}) {
    try {
      console.log('Saving new file:', fileName);

      const fullContent = this.addFileHeader(content, metadata);
      const blob = new Blob([fullContent], {
        type: 'text/markdown;charset=utf-8'
      });
      
      // 使用 Data URL 替代 URL.createObjectURL (兼容 Service Worker)
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      
      try {
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: false,
          conflictAction: 'uniquify'
        });

        console.log('Download started with ID:', downloadId);
        const downloadInfo = await this.waitForDownloadComplete(downloadId);
        
        return {
          success: true,
          mode: 'new',
          fileName: fileName,
          downloadId: downloadId,
          path: downloadInfo.filename,
          size: blob.size,
          contentLength: content.length,
          timestamp: new Date().toISOString()
        };
      } catch (downloadError) {
        console.error('Download failed:', downloadError);
        throw downloadError;
      }
    } catch (error) {
      console.error('New file save failed:', error);
      throw new Error(`新建文件保存失败: ${error.message}`);
    }
  }

  async appendToFile(content, metadata = {}) {
    try {
      console.log('Appending to existing file...');

      // 由于background script无法直接使用File System Access API
      // 这里使用下载API的变通方法
      const separator = this.createSeparator(metadata);
      const appendContent = `\n\n${separator}\n${content}\n`;
      
      // 生成追加文件名
      const fileName = `APPEND_${this.generateFileName(metadata)}`;
      
      const blob = new Blob([appendContent], {
        type: 'text/markdown;charset=utf-8'
      });
      
      // 使用 Data URL 替代 URL.createObjectURL (兼容 Service Worker)
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      
      try {
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: true, // 让用户选择位置
          conflictAction: 'uniquify'
        });

        const downloadInfo = await this.waitForDownloadComplete(downloadId);
        
        return {
          success: true,
          mode: 'append',
          fileName: fileName,
          appendedLength: appendContent.length,
          timestamp: new Date().toISOString(),
          note: '请手动将此文件内容追加到目标文件'
        };
      } catch (downloadError) {
        console.error('Append download failed:', downloadError);
        throw downloadError;
      }
    } catch (error) {
      console.error('Append to file failed:', error);
      throw new Error(`追加文件失败: ${error.message}`);
    }
  }

  addFileHeader(content, metadata = {}) {
    const header = [
      '<!-- WebtoMD Export -->',
      `<!-- Source: ${metadata.url || ''} -->`,
      `<!-- Title: ${metadata.title || ''} -->`,
      `<!-- Export Time: ${new Date().toISOString()} -->`,
      `<!-- Generated by WebtoMD Chrome Extension -->`,
      '',
      ''
    ].join('\n');

    return header + content;
  }

  createSeparator(metadata = {}) {
    const separator = [
      '---',
      `**来源**: ${metadata.url || ''}`,
      `**标题**: ${metadata.title || ''}`,
      `**时间**: ${new Date().toLocaleString('zh-CN')}`,
      '---'
    ].join('\n');

    return separator;
  }

  async waitForDownloadComplete(downloadId) {
    return new Promise((resolve, reject) => {
      const checkDownload = () => {
        chrome.downloads.search({ id: downloadId }, (downloads) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const download = downloads[0];
          if (!download) {
            reject(new Error('下载信息不存在'));
            return;
          }

          switch (download.state) {
            case 'complete':
              resolve(download);
              break;
            case 'interrupted':
              reject(new Error(`下载被中断: ${download.error}`));
              break;
            case 'in_progress':
              setTimeout(checkDownload, 100);
              break;
            default:
              setTimeout(checkDownload, 100);
              break;
          }
        });
      };

      checkDownload();
    });
  }

  async saveSaveHistory(saveResult) {
    try {
      const { saveHistory = [] } = await chrome.storage.local.get(['saveHistory']);
      
      saveHistory.unshift({
        ...saveResult,
        id: Date.now()
      });

      const maxHistory = 50;
      if (saveHistory.length > maxHistory) {
        saveHistory.splice(maxHistory);
      }

      await chrome.storage.local.set({ saveHistory });
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }
}

class WebtoMDBackground {
  constructor() {
    this.fileHandler = new FileHandler();
    this.notificationManager = new BackgroundNotificationManager();
    this.contextMenuManager = new BackgroundContextMenuManager();
    this.statusManager = new BackgroundStatusManager();
    this.init();
  }

  /**
   * 初始化后台服务
   */
  init() {
    // 扩展安装时的初始化
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('WebtoMD Extension installed:', details);
      this.contextMenuManager.createMenus();
      this.statusManager.setStatus('installed', { details });
    });

    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 保持消息通道开放
    });

    // 监听快捷键命令
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'save-as-markdown') {
        this.handleSaveCommand();
      }
    });

    // 监听上下文菜单点击
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.contextMenuManager.handleMenuClick(info, tab, (saveMode) => {
        this.handleContextMenuAction(info, tab, saveMode);
      });
    });

    console.log('WebtoMD Background Script initialized');
  }

  /**
   * 处理上下文菜单操作
   * @param {Object} info 菜单信息
   * @param {Object} tab 标签页信息
   * @param {string} saveMode 保存模式
   */
  async handleContextMenuAction(info, tab, saveMode) {
    try {
      this.statusManager.setStatus('context-menu-action', { saveMode, tab: tab.id });
      
      // 确保content script已注入，然后请求选中内容
      await this.ensureContentScriptInjected(tab.id);
      
      // 向content script请求选中内容
      chrome.tabs.sendMessage(tab.id, { action: 'getSelectedContent' }, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || 'Unknown runtime error';
          console.error('Runtime error getting selected content:', errorMsg);
          this.notificationManager.showError(`通信错误: ${errorMsg}`);
          return;
        }

        console.log('Content selection response:', response);

        if (response && response.success) {
          console.log('Processing selected content with data:', response.data);
          this.processSelectedContent(response.data, tab, saveMode);
        } else {
          // 详细的错误处理和调试
          console.error('Content selection failed. Full response:', response);
          
          let errorMessage = '获取选中内容失败';
          if (response) {
            if (typeof response.error === 'string') {
              errorMessage = response.error;
            } else if (response.error && typeof response.error === 'object') {
              if (response.error.message) {
                errorMessage = response.error.message;
              } else {
                try {
                  errorMessage = JSON.stringify(response.error);
                } catch (jsonError) {
                  errorMessage = `序列化错误对象失败: ${response.error.toString()}`;
                }
              }
            } else if (response.error) {
              errorMessage = String(response.error);
            }
          } else {
            errorMessage = '响应为空或未定义';
          }
          
          console.error('Processed error message:', errorMessage);
          this.notificationManager.showError(errorMessage);
        }
      });
    } catch (error) {
      console.error('Context menu action error:', error);
      this.notificationManager.showError(error.message);
    }
  }

  /**
   * 处理消息
   * @param {Object} message 消息对象
   * @param {Object} sender 发送者信息
   * @param {Function} sendResponse 响应函数
   */
  async handleMessage(message, sender, sendResponse) {
    try {
      this.statusManager.setStatus('message-received', { action: message.action });
      
      switch (message.action) {
        case 'processSelectedContent':
          await this.processSelectedContent(message.data, sender.tab, message.saveMode || 'new');
          sendResponse({ success: true });
          break;

        case 'getSelectedContent':
          // 转发到content script
          chrome.tabs.sendMessage(sender.tab.id, message, sendResponse);
          break;

        case 'getStatus':
          sendResponse({
            success: true,
            status: this.statusManager.getStatus(),
            history: this.statusManager.statusHistory.slice(-5)
          });
          break;

        case 'clearNotifications':
          if (chrome.notifications) {
            chrome.notifications.getAll((notifications) => {
              Object.keys(notifications).forEach(id => {
                chrome.notifications.clear(id);
              });
            });
          }
          sendResponse({ success: true });
          break;

        default:
          console.warn('Unknown message action:', message.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * 处理快捷键保存命令
   */
  async handleSaveCommand() {
    try {
      this.statusManager.setStatus('shortcut-triggered');
      
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('无法获取当前标签页');
      }

      // 确保content script已注入，然后请求选中内容
      await this.ensureContentScriptInjected(tab.id);

      // 向content script请求选中内容
      chrome.tabs.sendMessage(tab.id, { action: 'getSelectedContent' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to get selected content:', chrome.runtime.lastError);
          this.notificationManager.showError(`通信错误: ${chrome.runtime.lastError.message}`);
          return;
        }

        console.log('Shortcut content selection response:', response);

        if (response && response.success) {
          this.processSelectedContent(response.data, tab, 'new'); // 快捷键默认使用新建模式
        } else {
          // 改进错误处理，正确解析错误信息
          let errorMessage = '获取选中内容失败';
          if (response) {
            if (typeof response.error === 'string') {
              errorMessage = response.error;
            } else if (response.error && response.error.message) {
              errorMessage = response.error.message;
            } else if (response.error) {
              errorMessage = JSON.stringify(response.error);
            }
          }
          console.error('Shortcut content selection failed:', response);
          this.notificationManager.showError(errorMessage);
        }
      });
    } catch (error) {
      console.error('Save command error:', error);
      this.notificationManager.showError(error.message);
    }
  }


  /**
   * 处理选中内容
   * @param {Object} selectedData 选中的内容数据
   * @param {Object} tab 标签页信息
   * @param {string} saveMode 保存模式 ('new' 或 'append')
   */
  async processSelectedContent(selectedData, tab, saveMode = 'new') {
    try {
      console.log('Processing selected content:', selectedData);
      this.statusManager.setStatus('processing', { saveMode, tab: tab.id });

      // 验证选中内容
      if (!this.validateSelectedContent(selectedData)) {
        throw new Error('选中内容无效');
      }

      // 显示转换开始通知
      this.notificationManager.showInfo('正在将内容转换为Markdown格式...');

      // 执行Markdown转换
      const conversionResult = await this.convertToMarkdown(selectedData);
      this.statusManager.setStatus('converted', { length: conversionResult.markdown.length });
      
      // 显示保存开始通知
      this.notificationManager.showInfo('正在保存Markdown文件...');

      // 执行文件保存
      const saveResult = await this.saveToFile(conversionResult, selectedData, saveMode);
      this.statusManager.setStatus('saved', { fileName: saveResult.fileName });

      // 存储完整结果到storage
      await chrome.storage.local.set({
        selectedContent: selectedData,
        markdownResult: conversionResult,
        saveResult: saveResult,
        saveMode: saveMode,
        processedAt: Date.now()
      });

      // 显示保存成功通知
      this.notificationManager.showSuccess(
        `已成功保存到 ${saveResult.fileName}`
      );

      this.statusManager.setStatus('completed', {
        fileName: saveResult.fileName,
        mode: saveMode
      });

      console.log('Content converted and saved successfully');

    } catch (error) {
      console.error('Process selected content error:', error);
      this.statusManager.setStatus('error', { error: error.message });
      this.notificationManager.showError(error.message);
    }
  }

  /**
   * 将HTML内容转换为Markdown
   * @param {Object} selectedData 选中的内容数据
   * @returns {Promise<Object>} 转换结果
   */
  async convertToMarkdown(selectedData) {
    try {
      // 向content script请求执行转换
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'convertToMarkdown',
          data: selectedData
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('转换服务不可用'));
            return;
          }

          if (response && response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response?.error || '转换失败'));
          }
        });
      });
    } catch (error) {
      console.error('Markdown conversion failed:', error);
      throw new Error(`Markdown转换失败: ${error.message}`);
    }
  }

  /**
   * 保存文件
   * @param {Object} conversionResult 转换结果
   * @param {Object} selectedData 选中的内容数据
   * @param {string} saveMode 保存模式
   * @returns {Promise<Object>} 保存结果
   */
  async saveToFile(conversionResult, selectedData, saveMode) {
    try {
      console.log('Starting file save process');

      // 准备保存选项
      const saveOptions = {
        mode: saveMode,
        showProgress: true
      };

      // 准备元数据
      const metadata = {
        ...selectedData.metadata,
        conversionStats: conversionResult.metadata
      };

      // 执行文件保存
      const saveResult = await this.fileHandler.saveContent(
        conversionResult.markdown,
        saveOptions,
        metadata
      );

      console.log('File save completed:', saveResult);
      return saveResult;

    } catch (error) {
      console.error('File save failed:', error);
      throw new Error(`文件保存失败: ${error.message}`);
    }
  }

  /**
   * 验证选中内容
   * @param {Object} selectedData 选中的内容数据
   * @returns {boolean} 是否有效
   */
  validateSelectedContent(selectedData) {
    if (!selectedData) {
      console.error('Selected data is null or undefined');
      return false;
    }

    if (!selectedData.text || selectedData.text.trim().length === 0) {
      console.error('Selected text is empty');
      return false;
    }

    if (!selectedData.html) {
      console.error('Selected HTML is empty');
      return false;
    }

    if (!selectedData.metadata || !selectedData.metadata.url) {
      console.error('Metadata is missing');
      return false;
    }

    return true;
  }


  /**
   * 获取存储的内容
   * @returns {Promise<Object>} 存储的内容
   */
  async getStoredContent() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['selectedContent', 'saveMode', 'processedAt'], (result) => {
        resolve(result);
      });
    });
  }

  /**
   * 清理存储的内容
   */
  async clearStoredContent() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['selectedContent', 'saveMode', 'processedAt'], () => {
        resolve();
      });
    });
  }

  /**
   * 确保content script已注入到指定标签页
   * @param {number} tabId 标签页ID
   */
  async ensureContentScriptInjected(tabId) {
    try {
      // 首先尝试ping content script
      const pingResult = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(response && response.success);
          }
        });
      });

      if (pingResult) {
        console.log('Content script already injected');
        return;
      }

      console.log('Content script not found, injecting...');
      
      // 注入所有必需的脚本
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'lib/turndown-service.js',
          'markdown-converter.js',
          'in-page-notification.js',
          'content-script.js'
        ]
      });

      console.log('Content scripts injected successfully');
      
      // 等待一小段时间确保脚本初始化完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Failed to inject content script:', error);
      throw new Error(`无法注入内容脚本: ${error.message}`);
    }
  }

  /**
   * 检查页面是否支持content script注入
   * @param {string} url 页面URL
   * @returns {boolean} 是否支持注入
   */
  isPageSupported(url) {
    if (!url) return false;
    
    // 不支持的页面类型
    const unsupportedProtocols = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://'
    ];
    
    return !unsupportedProtocols.some(protocol => url.startsWith(protocol));
  }
}

// 实例化后台服务
const webtoMDBackground = new WebtoMDBackground();

// 导出供其他模块使用（如果需要）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebtoMDBackground;
}