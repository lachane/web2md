/**
 * WebtoMD Content Script - 内容选择功能
 * 实现网页内容的选择和预处理功能
 */

class ContentSelector {
  constructor() {
    this.selectedContent = null;
    this.originalFormat = null;
    this.init();
  }

  /**
   * 初始化内容选择器
   */
  init() {
    // 监听来自background script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.action === 'ping') {
          // 响应ping消息，确认content script已加载
          sendResponse({ success: true, message: 'Content script is ready' });
          return false; // 同步响应
        } else if (message.action === 'getSelectedContent') {
          this.handleContentSelection()
            .then(content => {
              console.log('Content selection successful:', content);
              sendResponse({ success: true, data: content });
            })
            .catch(error => {
              console.error('Content selection error:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              sendResponse({ success: false, error: errorMessage });
            });
          return true; // 保持消息通道开放以支持异步响应
        } else if (message.action === 'convertToMarkdown') {
          this.handleMarkdownConversion(message.data)
            .then(result => {
              console.log('Markdown conversion successful:', result);
              sendResponse({ success: true, result: result });
            })
            .catch(error => {
              console.error('Markdown conversion error:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              sendResponse({ success: false, error: errorMessage });
            });
          return true; // 保持消息通道开放以支持异步响应
        } else if (message.action === 'showInPageNotification') {
          // 处理页面内通知显示
          try {
            if (window.inPageNotification) {
              const { type = 'info', message: notifyMessage, notification } = message;
              if (notification) {
                window.inPageNotification[notification.priority === 2 ? 'error' :
                                          notification.priority === 0 ? 'success' : 'info']
                                          (notification.message);
              } else {
                window.inPageNotification[type](notifyMessage);
              }
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: '页面内通知系统未初始化' });
            }
          } catch (notifyError) {
            console.error('In-page notification error:', notifyError);
            sendResponse({ success: false, error: notifyError.message });
          }
          return false; // 同步响应
        }
      } catch (globalError) {
        console.error('Message handling error:', globalError);
        const errorMessage = globalError instanceof Error ? globalError.message : String(globalError);
        sendResponse({ success: false, error: errorMessage });
      }
    });

    // 监听快捷键
    document.addEventListener('keydown', (event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      
      if (ctrlKey && event.shiftKey && event.key === 'S') {
        event.preventDefault();
        this.handleContentSelection();
      }
    });

    console.log('WebtoMD Content Script initialized');
  }

  /**
   * 处理内容选择
   */
  async handleContentSelection() {
    try {
      const selection = window.getSelection();
      
      if (!selection || selection.rangeCount === 0) {
        throw new Error('没有选中任何内容');
      }

      if (selection.toString().trim() === '') {
        throw new Error('选中内容为空');
      }

      // 获取选中内容的完整信息
      const selectedData = this.getSelectedContent();
      
      // 不再自动发送处理请求，只返回数据
      // 避免与右键菜单触发的处理流程冲突
      return selectedData;
    } catch (error) {
      console.error('内容选择失败:', error);
      throw error;
    }
  }

  /**
   * 获取选中内容的HTML结构
   * @returns {DocumentFragment} 选中内容的DOM片段
   */
  getSelectedHTML() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      return null;
    }
    
    const range = selection.getRangeAt(0);
    return range.cloneContents();
  }

  /**
   * 获取选中内容的完整信息
   * @returns {SelectedContent} 包含HTML、文本和元数据的完整信息
   */
  getSelectedContent() {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    
    // 获取选中的DOM片段
    const fragment = range.cloneContents();
    
    // 创建临时容器来获取HTML字符串
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment.cloneNode(true));
    
    // 清理HTML属性，只保留必要的
    this.cleanupHTML(tempDiv);
    
    // 构建返回数据
    const selectedData = {
      html: tempDiv.innerHTML,
      text: selection.toString(),
      metadata: {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        domain: window.location.hostname,
        selectionInfo: {
          startOffset: range.startOffset,
          endOffset: range.endOffset,
          commonAncestor: this.getElementSelector(range.commonAncestorContainer)
        }
      }
    };

    return selectedData;
  }

  /**
   * 清理HTML内容，保留必要的属性
   * @param {Element} container 包含HTML内容的容器元素
   */
  cleanupHTML(container) {
    // 保留的属性列表
    const keepAttributes = ['href', 'src', 'alt', 'title', 'type', 'value', 'colspan', 'rowspan'];
    
    // 递归处理所有元素
    const cleanElement = (element) => {
      if (element.nodeType === Node.ELEMENT_NODE) {
        // 获取所有属性
        const attributes = Array.from(element.attributes);
        
        // 移除不需要的属性
        attributes.forEach(attr => {
          if (!keepAttributes.includes(attr.name)) {
            element.removeAttribute(attr.name);
          }
        });

        // 处理特殊标签
        this.processSpecialTags(element);
        
        // 递归处理子元素
        Array.from(element.children).forEach(child => {
          cleanElement(child);
        });
      }
    };

    Array.from(container.children).forEach(child => {
      cleanElement(child);
    });
  }

  /**
   * 处理特殊标签
   * @param {Element} element 要处理的元素
   */
  processSpecialTags(element) {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'script':
      case 'style':
      case 'noscript':
        // 移除脚本和样式标签
        element.remove();
        break;
        
      case 'img':
        // 确保图片有alt属性
        if (!element.getAttribute('alt')) {
          element.setAttribute('alt', '图片');
        }
        break;
        
      case 'a':
        // 确保链接有href属性
        if (!element.getAttribute('href')) {
          // 如果没有href，将其转换为普通文本
          const text = element.textContent;
          element.replaceWith(document.createTextNode(text));
        }
        break;
        
      case 'table':
        // 为表格添加基本结构标记
        if (!element.querySelector('thead') && !element.querySelector('tbody')) {
          const rows = element.querySelectorAll('tr');
          if (rows.length > 0) {
            // 如果第一行包含th，将其包装在thead中
            const firstRow = rows[0];
            if (firstRow.querySelector('th')) {
              const thead = document.createElement('thead');
              thead.appendChild(firstRow.cloneNode(true));
              element.insertBefore(thead, element.firstChild);
              firstRow.remove();
            }
          }
        }
        break;
    }
  }

  /**
   * 获取元素的CSS选择器路径
   * @param {Node} node DOM节点
   * @returns {string} CSS选择器字符串
   */
  getElementSelector(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentElement;
    }
    
    if (!node) return '';
    
    const path = [];
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let selector = node.tagName.toLowerCase();
      
      if (node.id) {
        selector += `#${node.id}`;
        path.unshift(selector);
        break;
      }
      
      if (node.className) {
        const classes = node.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`;
        }
      }
      
      path.unshift(selector);
      node = node.parentElement;
      
      // 限制路径深度
      if (path.length > 5) break;
    }
    
    return path.join(' > ');
  }

  /**
   * 验证选中内容是否有效
   * @param {SelectedContent} content 选中的内容
   * @returns {boolean} 是否有效
   */
  validateSelectedContent(content) {
    if (!content || !content.text || !content.html) {
      return false;
    }
    
    // 检查内容长度
    if (content.text.trim().length === 0) {
      return false;
    }
    
    // 检查是否包含过多的特殊字符（可能是乱码）
    const specialCharRatio = (content.text.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length / content.text.length;
    if (specialCharRatio > 0.5) {
      console.warn('选中内容包含过多特殊字符，可能存在问题');
    }
    
    return true;
  }

  /**
   * 处理Markdown转换
   * @param {Object} selectedData 选中的内容数据
   * @returns {Promise<Object>} 转换结果
   */
  async handleMarkdownConversion(selectedData) {
    try {
      // 显示转换开始通知
      if (window.inPageNotification) {
        window.inPageNotification.info('正在转换为Markdown格式...', {
          duration: 2000
        });
      }

      // 实例化Markdown转换器
      const markdownConverter = new MarkdownConverter();
      
      // 执行转换
      const conversionResult = markdownConverter.convert(selectedData.html, selectedData.metadata);
      
      // 显示转换完成通知
      if (window.inPageNotification) {
        window.inPageNotification.success('Markdown转换完成', {
          duration: 1500
        });
      }

      console.log('Markdown conversion completed:', conversionResult);
      return conversionResult;
    } catch (error) {
      console.error('Markdown conversion failed:', error);
      
      // 显示错误通知
      if (window.inPageNotification) {
        window.inPageNotification.error(`转换失败: ${error.message}`);
      }
      
      throw new Error(`Markdown转换失败: ${error.message}`);
    }
  }
}

// 定义选中内容的数据结构（注释形式的TypeScript接口）
/**
 * @typedef {Object} SelectedContent
 * @property {string} html - 原始HTML内容
 * @property {string} text - 纯文本内容
 * @property {Object} metadata - 元数据信息
 * @property {string} metadata.url - 来源页面URL
 * @property {string} metadata.title - 页面标题
 * @property {string} metadata.timestamp - 选择时间戳
 * @property {string} metadata.domain - 域名
 * @property {Object} metadata.selectionInfo - 选择信息
 */

// 实例化内容选择器
const contentSelector = new ContentSelector();

// 导出供其他模块使用（如果需要）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentSelector;
}