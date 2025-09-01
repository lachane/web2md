/**
 * WebtoMD Markdown Converter - HTML到Markdown转换功能
 * 基于turndown.js实现高质量的格式转换
 */

class MarkdownConverter {
  constructor() {
    this.converter = null;
    this.init();
  }

  /**
   * 初始化转换器
   */
  init() {
    // 检查turndown是否可用
    if (typeof TurndownService === 'undefined') {
      throw new Error('TurndownService is not available');
    }

    // 配置转换选项
    this.converter = new TurndownService({
      headingStyle: 'atx',        // 使用 # 式标题
      codeBlockStyle: 'fenced',   // 使用 ``` 式代码块
      emDelimiter: '_',           // 使用下划线表示斜体
      strongDelimiter: '**',      // 使用双星号表示粗体
      linkStyle: 'inlineLink',    // 使用内联式链接
      br: '\n',                   // 换行符处理
      hr: '---'                   // 水平分割线样式
    });

    // 初始化自定义转换规则
    this.initCustomRules();

    console.log('MarkdownConverter initialized');
  }

  /**
   * 初始化自定义转换规则
   */
  initCustomRules() {
    // 表格转换规则
    this.converter.addRule('tables', {
      filter: 'table',
      replacement: (content, node) => {
        return this.convertTable(node);
      }
    });

    // 改进的列表处理
    this.converter.addRule('improvedLists', {
      filter: ['ul', 'ol'],
      replacement: (content, node) => {
        return this.convertList(node);
      }
    });

    // 代码块优化
    this.converter.addRule('codeBlocks', {
      filter: (node) => {
        return node.nodeName === 'PRE' && node.querySelector('code');
      },
      replacement: (content, node) => {
        return this.convertCodeBlock(node);
      }
    });

    // 图片处理（暂不下载，只保留引用）
    this.converter.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '图片';
        const src = node.getAttribute('src') || '';
        const title = node.getAttribute('title') || '';
        
        if (!src) return `[${alt}]`;
        
        const titlePart = title ? ` "${title}"` : '';
        return `![${alt}](${src}${titlePart})`;
      }
    });

    // 删除线支持
    this.converter.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => {
        return content.trim() ? `~~${content}~~` : '';
      }
    });

    // 下划线转换（HTML的u标签在Markdown中没有直接对应）
    this.converter.addRule('underline', {
      filter: 'u',
      replacement: (content) => {
        return content.trim() ? `<u>${content}</u>` : '';
      }
    });

    // 引用块优化
    this.converter.addRule('blockquotes', {
      filter: 'blockquote',
      replacement: (content) => {
        const lines = content.trim().split('\n');
        const quotedLines = lines.map(line => {
          const trimmed = line.trim();
          return trimmed ? `> ${trimmed}` : '>';
        });
        return `\n\n${quotedLines.join('\n')}\n\n`;
      }
    });
  }

  /**
   * 转换表格
   * @param {Element} tableNode 表格节点
   * @returns {string} Markdown格式的表格
   */
  convertTable(tableNode) {
    const rows = tableNode.querySelectorAll('tr');
    if (rows.length === 0) return '';

    let markdown = '\n\n';
    let hasHeader = false;

    // 检查是否有thead或第一行包含th
    const firstRow = rows[0];
    if (tableNode.querySelector('thead') || firstRow.querySelector('th')) {
      hasHeader = true;
    }

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      const cellContents = Array.from(cells).map(cell => {
        const content = cell.textContent || cell.innerText || '';
        return content.trim().replace(/\|/g, '\\|'); // 转义管道符
      });

      // 构建表格行
      markdown += `| ${cellContents.join(' | ')} |\n`;

      // 如果这是第一行且有标题，添加分隔符
      if (rowIndex === 0 && hasHeader) {
        const separator = cellContents.map(() => '---').join(' | ');
        markdown += `| ${separator} |\n`;
      }
    });

    return markdown + '\n';
  }

  /**
   * 转换列表
   * @param {Element} listNode 列表节点
   * @returns {string} Markdown格式的列表
   */
  convertList(listNode) {
    const isOrdered = listNode.nodeName.toLowerCase() === 'ol';
    const items = listNode.querySelectorAll('li');
    
    if (items.length === 0) return '';

    let markdown = '\n\n';
    
    items.forEach((item, index) => {
      const content = this.getTextContent(item).trim();
      if (content) {
        const prefix = isOrdered ? `${index + 1}. ` : '- ';
        // 处理多行内容的缩进
        const lines = content.split('\n');
        const formattedLines = lines.map((line, lineIndex) => {
          if (lineIndex === 0) {
            return `${prefix}${line}`;
          } else {
            const indent = isOrdered ? '   ' : '  '; // 有序列表需要额外的空格
            return `${indent}${line}`;
          }
        });
        markdown += formattedLines.join('\n') + '\n';
      }
    });

    return markdown + '\n';
  }

  /**
   * 转换代码块
   * @param {Element} preNode pre节点
   * @returns {string} Markdown格式的代码块
   */
  convertCodeBlock(preNode) {
    const codeNode = preNode.querySelector('code');
    if (!codeNode) return '';

    const content = codeNode.textContent || codeNode.innerText || '';
    
    // 尝试获取语言信息
    let language = '';
    const className = codeNode.getAttribute('class') || '';
    const langMatch = className.match(/language-(\w+)/);
    if (langMatch) {
      language = langMatch[1];
    }

    return `\n\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
  }

  /**
   * 获取元素的文本内容，保留基本格式
   * @param {Element} element DOM元素
   * @returns {string} 文本内容
   */
  getTextContent(element) {
    // 创建一个临时转换器来处理嵌套内容
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(element.cloneNode(true));
    
    // 移除嵌套的列表，避免重复处理
    const nestedLists = tempDiv.querySelectorAll('ul, ol');
    nestedLists.forEach(list => list.remove());

    return this.converter.turndown(tempDiv.innerHTML);
  }

  /**
   * 主要的转换方法
   * @param {string} html HTML字符串
   * @param {Object} metadata 元数据信息
   * @returns {Promise<Object>} 转换结果
   */
  async convert(html, metadata = {}) {
    try {
      console.log('Starting HTML to Markdown conversion...');
      
      // 验证输入
      if (!html || typeof html !== 'string') {
        throw new Error('Invalid HTML input');
      }

      // 预处理HTML
      const processedHtml = this.preProcessHtml(html);
      
      // 执行转换
      let markdown = this.converter.turndown(processedHtml);
      
      // 后处理优化
      markdown = this.postProcess(markdown);
      
      // 添加元数据信息
      const result = {
        markdown: markdown,
        metadata: {
          ...metadata,
          convertedAt: new Date().toISOString(),
          originalLength: html.length,
          markdownLength: markdown.length,
          compressionRatio: (markdown.length / html.length * 100).toFixed(2) + '%'
        }
      };

      console.log('Conversion completed successfully');
      return result;

    } catch (error) {
      console.error('Markdown conversion failed:', error);
      throw new Error(`转换失败: ${error.message}`);
    }
  }

  /**
   * HTML预处理
   * @param {string} html 原始HTML
   * @returns {string} 处理后的HTML
   */
  preProcessHtml(html) {
    // 创建临时DOM元素进行处理
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // 移除脚本和样式标签
    const scriptsAndStyles = tempDiv.querySelectorAll('script, style, noscript');
    scriptsAndStyles.forEach(element => element.remove());

    // 处理特殊的空白字符
    const textNodes = this.getTextNodes(tempDiv);
    textNodes.forEach(node => {
      node.textContent = node.textContent.replace(/\u00A0/g, ' '); // 替换不间断空格
    });

    // 清理空的段落和div
    const emptyElements = tempDiv.querySelectorAll('p:empty, div:empty');
    emptyElements.forEach(element => {
      if (!element.hasChildNodes()) {
        element.remove();
      }
    });

    return tempDiv.innerHTML;
  }

  /**
   * 获取所有文本节点
   * @param {Element} element 根元素
   * @returns {Array} 文本节点数组
   */
  getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Markdown后处理优化
   * @param {string} markdown 原始Markdown
   * @returns {string} 优化后的Markdown
   */
  postProcess(markdown) {
    // 清理多余的空行（超过2个连续换行符）
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    // 清理行首和行尾的空白
    markdown = markdown.replace(/^[ \t]+|[ \t]+$/gm, '');
    
    // 确保列表项之间的适当间距
    markdown = markdown.replace(/^([-*+]|\d+\.)\s/gm, (match) => {
      return match;
    });
    
    // 优化标题格式，确保标题前后有适当的空行
    markdown = markdown.replace(/^(#{1,6})\s(.+)$/gm, (match, hashes, title) => {
      return `${hashes} ${title.trim()}`;
    });
    
    // 清理引用块的格式
    markdown = markdown.replace(/^>\s*$/gm, '>');
    
    // 确保代码块前后有空行
    markdown = markdown.replace(/(^|\n)(```[\s\S]*?```)/g, '\n\n$2\n\n');
    
    // 最终清理：移除开头和结尾的多余空行
    markdown = markdown.trim();
    
    return markdown;
  }

  /**
   * 验证转换结果
   * @param {string} markdown Markdown内容
   * @returns {Object} 验证结果
   */
  validateMarkdown(markdown) {
    const validation = {
      isValid: true,
      warnings: [],
      stats: {
        lines: markdown.split('\n').length,
        headers: (markdown.match(/^#{1,6}\s/gm) || []).length,
        links: (markdown.match(/\[.*?\]\(.*?\)/g) || []).length,
        images: (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length,
        codeBlocks: (markdown.match(/```[\s\S]*?```/g) || []).length,
        tables: (markdown.match(/\|.*\|/gm) || []).length
      }
    };

    // 检查常见问题
    if (markdown.includes('undefined')) {
      validation.warnings.push('发现未定义的内容');
    }

    if (markdown.match(/\[.*?\]\(\s*\)/)) {
      validation.warnings.push('发现空链接');
    }

    if (markdown.match(/!\[.*?\]\(\s*\)/)) {
      validation.warnings.push('发现空图片链接');
    }

    return validation;
  }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownConverter;
}