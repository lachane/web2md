/**
 * Simplified TurndownService for WebtoMD
 * A lightweight HTML to Markdown converter
 */

class TurndownService {
  constructor(options = {}) {
    this.options = {
      headingStyle: options.headingStyle || 'atx',
      codeBlockStyle: options.codeBlockStyle || 'fenced',
      emDelimiter: options.emDelimiter || '_',
      strongDelimiter: options.strongDelimiter || '**',
      linkStyle: options.linkStyle || 'inlineLink',
      br: options.br || '\n',
      hr: options.hr || '---'
    };
    
    this.rules = [];
    this.initDefaultRules();
  }

  /**
   * 初始化默认转换规则
   */
  initDefaultRules() {
    // 段落
    this.addRule('paragraph', {
      filter: 'p',
      replacement: (content) => `\n\n${content}\n\n`
    });

    // 标题
    this.addRule('heading', {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      replacement: (content, node) => {
        const level = parseInt(node.nodeName.charAt(1));
        const prefix = '#'.repeat(level);
        return `\n\n${prefix} ${content}\n\n`;
      }
    });

    // 粗体
    this.addRule('strong', {
      filter: ['strong', 'b'],
      replacement: (content) => {
        return content.trim() ? `${this.options.strongDelimiter}${content}${this.options.strongDelimiter}` : '';
      }
    });

    // 斜体
    this.addRule('emphasis', {
      filter: ['em', 'i'],
      replacement: (content) => {
        return content.trim() ? `${this.options.emDelimiter}${content}${this.options.emDelimiter}` : '';
      }
    });

    // 链接
    this.addRule('link', {
      filter: 'a',
      replacement: (content, node) => {
        const href = node.getAttribute('href');
        const title = node.getAttribute('title');
        if (!href) return content;
        
        const titlePart = title ? ` "${title}"` : '';
        return `[${content}](${href}${titlePart})`;
      }
    });

    // 图片
    this.addRule('image', {
      filter: 'img',
      replacement: (content, node) => {
        const src = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        const title = node.getAttribute('title');
        
        if (!src) return `[${alt}]`;
        
        const titlePart = title ? ` "${title}"` : '';
        return `![${alt}](${src}${titlePart})`;
      }
    });

    // 代码
    this.addRule('code', {
      filter: 'code',
      replacement: (content, node) => {
        // 检查是否在pre标签内
        if (node.parentNode && node.parentNode.nodeName === 'PRE') {
          return content;
        }
        return content.trim() ? `\`${content}\`` : '';
      }
    });

    // 代码块
    this.addRule('codeBlock', {
      filter: 'pre',
      replacement: (content, node) => {
        const codeNode = node.querySelector('code');
        const text = codeNode ? codeNode.textContent : node.textContent;
        return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
      }
    });

    // 换行
    this.addRule('lineBreak', {
      filter: 'br',
      replacement: () => this.options.br
    });

    // 水平线
    this.addRule('horizontalRule', {
      filter: 'hr',
      replacement: () => `\n\n${this.options.hr}\n\n`
    });

    // 引用
    this.addRule('blockquote', {
      filter: 'blockquote',
      replacement: (content) => {
        const lines = content.trim().split('\n');
        const quotedLines = lines.map(line => `> ${line.trim()}`);
        return `\n\n${quotedLines.join('\n')}\n\n`;
      }
    });

    // 列表
    this.addRule('list', {
      filter: ['ul', 'ol'],
      replacement: (content, node) => {
        const isOrdered = node.nodeName === 'OL';
        const items = Array.from(node.children).filter(child => child.nodeName === 'LI');
        
        let result = '\n\n';
        items.forEach((item, index) => {
          const text = this.processNode(item).trim();
          if (text) {
            const prefix = isOrdered ? `${index + 1}. ` : '- ';
            result += `${prefix}${text}\n`;
          }
        });
        return result + '\n';
      }
    });

    // 列表项
    this.addRule('listItem', {
      filter: 'li',
      replacement: (content) => content.trim()
    });
  }

  /**
   * 添加自定义规则
   */
  addRule(name, rule) {
    this.rules.unshift({ name, ...rule });
  }

  /**
   * 主要转换方法
   */
  turndown(input) {
    let element;
    
    if (typeof input === 'string') {
      const doc = new DOMParser().parseFromString(input, 'text/html');
      element = doc.body;
    } else {
      element = input;
    }

    return this.processNode(element).trim();
  }

  /**
   * 处理DOM节点
   */
  processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    // 查找匹配的规则
    const rule = this.findMatchingRule(node);
    
    if (rule) {
      const content = this.processChildren(node);
      return rule.replacement(content, node);
    }

    // 默认处理：返回子节点内容
    return this.processChildren(node);
  }

  /**
   * 处理子节点
   */
  processChildren(node) {
    let result = '';
    for (const child of node.childNodes) {
      result += this.processNode(child);
    }
    return result;
  }

  /**
   * 查找匹配的规则
   */
  findMatchingRule(node) {
    for (const rule of this.rules) {
      if (this.matchesFilter(node, rule.filter)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * 检查节点是否匹配过滤器
   */
  matchesFilter(node, filter) {
    if (typeof filter === 'string') {
      return node.nodeName.toLowerCase() === filter.toLowerCase();
    }
    
    if (Array.isArray(filter)) {
      return filter.some(f => this.matchesFilter(node, f));
    }
    
    if (typeof filter === 'function') {
      return filter(node);
    }
    
    return false;
  }
}

// 全局导出
if (typeof window !== 'undefined') {
  window.TurndownService = TurndownService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TurndownService;
}