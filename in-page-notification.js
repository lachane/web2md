/**
 * WebtoMD In-Page Notification - 页面内通知组件
 * 在网页中显示通知消息的组件
 */

class InPageNotification {
  constructor() {
    this.container = null;
    this.notifications = new Map();
    this.animationDuration = 300;
    this.defaultDuration = 3000;
    this.init();
  }

  /**
   * 初始化通知系统
   */
  init() {
    this.createContainer();
    this.injectStyles();
    
    // 监听来自background script的通知消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'showInPageNotification') {
        this.show(message.notification || {
          type: message.type || 'info',
          message: message.message,
          title: message.title
        });
        sendResponse({ success: true });
      }
    });

    console.log('In-page notification system initialized');
  }

  /**
   * 创建通知容器
   */
  createContainer() {
    // 检查是否已存在容器
    if (document.getElementById('webtomd-notification-container')) {
      this.container = document.getElementById('webtomd-notification-container');
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'webtomd-notification-container';
    this.container.className = 'webtomd-notification-container';
    
    // 添加到页面
    document.body.appendChild(this.container);
  }

  /**
   * 注入样式
   */
  injectStyles() {
    // 检查是否已注入样式
    if (document.getElementById('webtomd-notification-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'webtomd-notification-styles';
    style.textContent = `
      .webtomd-notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .webtomd-notification {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        margin-bottom: 12px;
        padding: 16px;
        min-width: 300px;
        max-width: 400px;
        pointer-events: auto;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-left: 4px solid #3b82f6;
        position: relative;
        font-size: 14px;
        line-height: 1.4;
      }

      .webtomd-notification.show {
        transform: translateX(0);
        opacity: 1;
      }

      .webtomd-notification.hide {
        transform: translateX(100%);
        opacity: 0;
      }

      .webtomd-notification-success {
        border-left-color: #10b981;
      }

      .webtomd-notification-error {
        border-left-color: #ef4444;
      }

      .webtomd-notification-warning {
        border-left-color: #f59e0b;
      }

      .webtomd-notification-info {
        border-left-color: #3b82f6;
      }

      .webtomd-notification-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }

      .webtomd-notification-icon {
        width: 20px;
        height: 20px;
        margin-right: 8px;
        flex-shrink: 0;
      }

      .webtomd-notification-title {
        font-weight: 600;
        color: #1f2937;
        flex: 1;
      }

      .webtomd-notification-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #6b7280;
        font-size: 16px;
        line-height: 1;
        border-radius: 4px;
        transition: background-color 0.2s;
      }

      .webtomd-notification-close:hover {
        background-color: #f3f4f6;
        color: #374151;
      }

      .webtomd-notification-message {
        color: #4b5563;
        margin: 0;
      }

      .webtomd-notification-progress {
        margin-top: 8px;
        height: 4px;
        background-color: #e5e7eb;
        border-radius: 2px;
        overflow: hidden;
      }

      .webtomd-notification-progress-bar {
        height: 100%;
        background-color: #3b82f6;
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      /* 暗色主题适配 */
      @media (prefers-color-scheme: dark) {
        .webtomd-notification {
          background: #1f2937;
          color: #f9fafb;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .webtomd-notification-title {
          color: #f9fafb;
        }

        .webtomd-notification-message {
          color: #d1d5db;
        }

        .webtomd-notification-close {
          color: #9ca3af;
        }

        .webtomd-notification-close:hover {
          background-color: #374151;
          color: #f3f4f6;
        }

        .webtomd-notification-progress {
          background-color: #374151;
        }
      }

      /* 动画效果 */
      @keyframes webtomd-slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes webtomd-slide-out {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 显示通知
   * @param {Object} options 通知选项
   */
  show(options = {}) {
    const {
      type = 'info',
      title = 'WebtoMD',
      message = '',
      duration = this.defaultDuration,
      progress = null,
      actions = [],
      persistent = false
    } = options;

    const id = this.generateId();
    const notification = this.createNotificationElement(id, {
      type,
      title,
      message,
      progress,
      actions,
      persistent
    });

    // 添加到容器
    this.container.appendChild(notification);
    this.notifications.set(id, {
      element: notification,
      options,
      timestamp: Date.now()
    });

    // 触发显示动画
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // 设置自动隐藏
    if (!persistent && duration > 0) {
      setTimeout(() => {
        this.hide(id);
      }, duration);
    }

    return id;
  }

  /**
   * 创建通知元素
   * @param {string} id 通知ID
   * @param {Object} options 通知选项
   * @returns {HTMLElement} 通知元素
   */
  createNotificationElement(id, options) {
    const { type, title, message, progress, actions, persistent } = options;

    const notification = document.createElement('div');
    notification.className = `webtomd-notification webtomd-notification-${type}`;
    notification.dataset.id = id;

    // 图标
    const icon = this.getIcon(type);

    // 构建HTML
    notification.innerHTML = `
      <div class="webtomd-notification-header">
        <div class="webtomd-notification-icon">${icon}</div>
        <div class="webtomd-notification-title">${this.escapeHtml(title)}</div>
        ${!persistent ? '<button class="webtomd-notification-close">×</button>' : ''}
      </div>
      <div class="webtomd-notification-message">${this.escapeHtml(message)}</div>
      ${progress !== null ? `
        <div class="webtomd-notification-progress">
          <div class="webtomd-notification-progress-bar" style="width: ${progress}%"></div>
        </div>
      ` : ''}
    `;

    // 绑定关闭事件
    const closeButton = notification.querySelector('.webtomd-notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.hide(id);
      });
    }

    // 添加动作按钮
    if (actions && actions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'webtomd-notification-actions';
      actionsContainer.style.marginTop = '12px';

      actions.forEach(action => {
        const button = document.createElement('button');
        button.textContent = action.text;
        button.className = 'webtomd-notification-action-button';
        button.style.marginRight = '8px';
        button.style.padding = '4px 8px';
        button.style.border = '1px solid #d1d5db';
        button.style.borderRadius = '4px';
        button.style.background = 'white';
        button.style.cursor = 'pointer';
        
        button.addEventListener('click', () => {
          if (action.callback) {
            action.callback();
          }
          if (action.closeOnClick !== false) {
            this.hide(id);
          }
        });

        actionsContainer.appendChild(button);
      });

      notification.appendChild(actionsContainer);
    }

    return notification;
  }

  /**
   * 隐藏通知
   * @param {string} id 通知ID
   */
  hide(id) {
    const notificationData = this.notifications.get(id);
    if (!notificationData) return;

    const element = notificationData.element;
    element.classList.remove('show');
    element.classList.add('hide');

    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.notifications.delete(id);
    }, this.animationDuration);
  }

  /**
   * 更新通知进度
   * @param {string} id 通知ID
   * @param {number} progress 进度百分比
   */
  updateProgress(id, progress) {
    const notificationData = this.notifications.get(id);
    if (!notificationData) return;

    const progressBar = notificationData.element.querySelector('.webtomd-notification-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  }

  /**
   * 更新通知消息
   * @param {string} id 通知ID
   * @param {string} message 新消息
   */
  updateMessage(id, message) {
    const notificationData = this.notifications.get(id);
    if (!notificationData) return;

    const messageElement = notificationData.element.querySelector('.webtomd-notification-message');
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  /**
   * 清除所有通知
   */
  clearAll() {
    this.notifications.forEach((_, id) => {
      this.hide(id);
    });
  }

  /**
   * 获取类型对应的图标
   * @param {string} type 通知类型
   * @returns {string} 图标HTML
   */
  getIcon(type) {
    const icons = {
      success: `<svg fill="currentColor" viewBox="0 0 20 20" style="color: #10b981;">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`,
      error: `<svg fill="currentColor" viewBox="0 0 20 20" style="color: #ef4444;">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`,
      warning: `<svg fill="currentColor" viewBox="0 0 20 20" style="color: #f59e0b;">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`,
      info: `<svg fill="currentColor" viewBox="0 0 20 20" style="color: #3b82f6;">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`
    };

    return icons[type] || icons.info;
  }

  /**
   * 转义HTML字符
   * @param {string} text 要转义的文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 生成唯一ID
   * @returns {string} 唯一ID
   */
  generateId() {
    return `webtomd-notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 显示快捷方法
   */
  success(message, options = {}) {
    return this.show({ ...options, type: 'success', message });
  }

  error(message, options = {}) {
    return this.show({ ...options, type: 'error', message });
  }

  warning(message, options = {}) {
    return this.show({ ...options, type: 'warning', message });
  }

  info(message, options = {}) {
    return this.show({ ...options, type: 'info', message });
  }
}

// 初始化页面内通知系统
const inPageNotification = new InPageNotification();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InPageNotification;
}