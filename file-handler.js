/**
 * WebtoMD File Handler - 文件保存功能
 * 支持新建文件保存和追加到现有文件两种模式
 */

class FileHandler {
  constructor() {
    this.lastUsedMode = 'new'; // 'new' 或 'append'
    this.fileHandle = null;
    this.permissionManager = new FilePermissionManager();
  }

  /**
   * 主要的保存内容方法
   * @param {string} markdown Markdown内容
   * @param {Object} options 保存选项
   * @param {Object} metadata 元数据信息
   * @returns {Promise<Object>} 保存结果
   */
  async saveContent(markdown, options = {}, metadata = {}) {
    try {
      const {
        mode = this.lastUsedMode,
        fileName = this.generateFileName(metadata),
        showProgress = true
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

      // 记住用户选择的模式
      this.lastUsedMode = mode;
      
      // 存储保存历史
      await this.saveSaveHistory(result);

      console.log('File save completed successfully');
      return result;

    } catch (error) {
      console.error('File save failed:', error);
      throw new Error(`文件保存失败: ${error.message}`);
    }
  }

  /**
   * 生成文件名
   * @param {Object} metadata 元数据
   * @returns {string} 生成的文件名
   */
  generateFileName(metadata = {}) {
    try {
      // 使用当前时间生成时间戳
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
      
      // 获取页面标题，如果没有则使用默认值
      let pageTitle = metadata.title || document.title || 'WebtoMD';
      
      // 清理标题，移除特殊字符
      pageTitle = pageTitle
        .replace(/[<>:"/\\|?*]/g, '_')  // 替换不允许的文件名字符
        .replace(/\s+/g, '_')          // 替换空格为下划线
        .slice(0, 50);                 // 限制长度
      
      // 确保标题不为空
      if (!pageTitle || pageTitle === '_') {
        pageTitle = 'WebtoMD_Export';
      }

      const fileName = `${pageTitle}_${timestamp}.md`;
      console.log('Generated filename:', fileName);
      return fileName;

    } catch (error) {
      console.error('Error generating filename:', error);
      return `WebtoMD_Export_${Date.now()}.md`;
    }
  }

  /**
   * 新建文件保存
   * @param {string} content 文件内容
   * @param {string} fileName 文件名
   * @param {Object} metadata 元数据
   * @returns {Promise<Object>} 保存结果
   */
  async saveNewFile(content, fileName, metadata = {}) {
    try {
      console.log('Saving new file:', fileName);

      // 添加文件头部信息
      const fullContent = this.addFileHeader(content, metadata);
      
      // 创建 Blob 对象
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
        // 使用 Chrome Downloads API 下载文件
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: fileName,
          saveAs: false,  // 直接保存到默认下载目录
          conflictAction: 'uniquify'  // 如果文件名冲突，自动重命名
        });

        console.log('Download started with ID:', downloadId);

        // 等待下载完成
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

  /**
   * 追加到现有文件
   * @param {string} content 要追加的内容
   * @param {Object} metadata 元数据
   * @returns {Promise<Object>} 保存结果
   */
  async appendToFile(content, metadata = {}) {
    try {
      console.log('Appending to existing file...');

      // 检查 File System Access API 支持
      if (!window.showOpenFilePicker) {
        throw new Error('浏览器不支持文件选择功能，请使用新建文件模式');
      }

      // 选择文件
      const fileHandle = await this.pickMarkdownFile();
      if (!fileHandle) {
        throw new Error('用户取消了文件选择');
      }

      // 请求文件权限
      const hasPermission = await this.permissionManager.requestPermission(fileHandle);
      if (!hasPermission) {
        throw new Error('没有文件写入权限');
      }

      // 读取现有文件内容
      const existingFile = await fileHandle.getFile();
      const existingContent = await existingFile.text();

      // 创建分隔符和要追加的内容
      const separator = this.createSeparator(metadata);
      const appendContent = `\n\n${separator}\n${content}\n`;
      
      // 合并内容
      const fullContent = existingContent + appendContent;

      // 写入文件
      const writable = await fileHandle.createWritable();
      await writable.write(fullContent);
      await writable.close();

      console.log('Content appended successfully');

      return {
        success: true,
        mode: 'append',
        fileName: existingFile.name,
        originalSize: existingFile.size,
        appendedLength: appendContent.length,
        newSize: fullContent.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Append to file failed:', error);
      
      // 特殊处理用户取消的情况
      if (error.name === 'AbortError') {
        throw new Error('用户取消了文件选择');
      }
      
      throw new Error(`追加文件失败: ${error.message}`);
    }
  }

  /**
   * 添加文件头部信息
   * @param {string} content 原始内容
   * @param {Object} metadata 元数据
   * @returns {string} 带头部信息的内容
   */
  addFileHeader(content, metadata = {}) {
    const header = [
      '<!-- WebtoMD Export -->',
      `<!-- Source: ${metadata.url || window.location.href} -->`,
      `<!-- Title: ${metadata.title || document.title} -->`,
      `<!-- Export Time: ${new Date().toISOString()} -->`,
      `<!-- Generated by WebtoMD Chrome Extension -->`,
      '',
      ''
    ].join('\n');

    return header + content;
  }

  /**
   * 创建分隔符
   * @param {Object} metadata 元数据
   * @returns {string} 分隔符内容
   */
  createSeparator(metadata = {}) {
    const separator = [
      '---',
      `**来源**: ${metadata.url || window.location.href}`,
      `**标题**: ${metadata.title || document.title}`,
      `**时间**: ${new Date().toLocaleString('zh-CN')}`,
      '---'
    ].join('\n');

    return separator;
  }

  /**
   * 选择 Markdown 文件
   * @returns {Promise<FileSystemFileHandle|null>} 文件句柄
   */
  async pickMarkdownFile() {
    try {
      const handles = await window.showOpenFilePicker({
        types: [{
          description: 'Markdown 文件',
          accept: { 
            'text/markdown': ['.md', '.markdown'],
            'text/plain': ['.txt']
          }
        }],
        multiple: false,
        excludeAcceptAllOption: true
      });

      return handles[0];

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('User cancelled file picker');
        return null;
      }
      throw error;
    }
  }

  /**
   * 等待下载完成
   * @param {number} downloadId 下载ID
   * @returns {Promise<Object>} 下载信息
   */
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
              // 继续等待
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

  /**
   * 保存操作历史
   * @param {Object} saveResult 保存结果
   */
  async saveSaveHistory(saveResult) {
    try {
      // 获取现有历史
      const { saveHistory = [] } = await chrome.storage.local.get(['saveHistory']);
      
      // 添加新记录
      saveHistory.unshift({
        ...saveResult,
        id: Date.now()
      });

      // 限制历史记录数量
      const maxHistory = 50;
      if (saveHistory.length > maxHistory) {
        saveHistory.splice(maxHistory);
      }

      // 保存历史
      await chrome.storage.local.set({ saveHistory });

    } catch (error) {
      console.error('Failed to save history:', error);
      // 不抛出错误，因为这不是关键功能
    }
  }

  /**
   * 获取保存历史
   * @returns {Promise<Array>} 历史记录
   */
  async getSaveHistory() {
    try {
      const { saveHistory = [] } = await chrome.storage.local.get(['saveHistory']);
      return saveHistory;
    } catch (error) {
      console.error('Failed to get save history:', error);
      return [];
    }
  }

  /**
   * 清理保存历史
   */
  async clearSaveHistory() {
    try {
      await chrome.storage.local.remove(['saveHistory']);
    } catch (error) {
      console.error('Failed to clear save history:', error);
    }
  }

  /**
   * 验证文件内容
   * @param {string} content 文件内容
   * @returns {Object} 验证结果
   */
  validateContent(content) {
    const validation = {
      isValid: true,
      warnings: [],
      stats: {
        length: content.length,
        lines: content.split('\n').length,
        size: new Blob([content]).size
      }
    };

    // 检查内容长度
    if (content.length === 0) {
      validation.isValid = false;
      validation.warnings.push('内容为空');
    }

    // 检查文件大小
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (validation.stats.size > maxSize) {
      validation.warnings.push('文件大小超过50MB，可能影响性能');
    }

    // 检查特殊字符
    if (content.includes('\u0000')) {
      validation.warnings.push('内容包含空字符，可能导致显示问题');
    }

    return validation;
  }
}

/**
 * 文件权限管理器
 */
class FilePermissionManager {
  constructor() {
    this.permissionCache = new Map();
  }

  /**
   * 请求文件权限
   * @param {FileSystemFileHandle} fileHandle 文件句柄
   * @returns {Promise<boolean>} 是否获得权限
   */
  async requestPermission(fileHandle) {
    try {
      const cacheKey = await this.getCacheKey(fileHandle);
      
      // 检查缓存
      if (this.permissionCache.has(cacheKey)) {
        return this.permissionCache.get(cacheKey);
      }

      // 检查现有权限
      const options = { mode: 'readwrite' };
      const currentPermission = await fileHandle.queryPermission(options);
      
      if (currentPermission === 'granted') {
        this.permissionCache.set(cacheKey, true);
        return true;
      }

      // 请求权限
      const newPermission = await fileHandle.requestPermission(options);
      const hasPermission = newPermission === 'granted';
      
      this.permissionCache.set(cacheKey, hasPermission);
      return hasPermission;

    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  /**
   * 获取缓存键
   * @param {FileSystemFileHandle} fileHandle 文件句柄
   * @returns {Promise<string>} 缓存键
   */
  async getCacheKey(fileHandle) {
    try {
      const file = await fileHandle.getFile();
      return `${file.name}_${file.lastModified}_${file.size}`;
    } catch (error) {
      return `${fileHandle.name}_${Date.now()}`;
    }
  }

  /**
   * 清理权限缓存
   */
  clearCache() {
    this.permissionCache.clear();
  }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FileHandler, FilePermissionManager };
}