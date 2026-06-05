/**
 * 文本处理器 - 文本清理、规范化和分块
 */
export class TextProcessor {
  /**
   * 文本预处理 - 清理和规范化文本
   * @param {string} text - 原始文本
   * @returns {string} 处理后的文本
   */
  static preprocessText(text) {
    if (!text) return '';
    
    let processed = text;
    
    // 1. 去除多余空白字符
    processed = processed.replace(/[ \t]+/g, ' ');
    
    // 2. 规范化换行符
    processed = processed.replace(/\r\n/g, '\n');
    processed = processed.replace(/\r/g, '\n');
    
    // 3. 去除特殊控制字符（保留换行和制表符）
    processed = processed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 4. 去除多余的空行（超过2个连续空行改为2个）
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // 5. 去除行首行尾空白
    processed = processed
      .split('\n')
      .map(line => line.trim())
      .join('\n');
    
    // 6. 去除首尾空白
    processed = processed.trim();
    
    return processed;
  }

  /**
   * 将长文本分割成小块
   * @param {string} text - 原始文本
   * @param {number} chunkSize - 每块的字符数（默认500）
   * @param {number} overlap - 块重叠大小（默认50）
   * @returns {string[]} 文本块列表
   */
  static splitText(text, chunkSize = 500, overlap = 50) {
    if (!text || text.length <= chunkSize) {
      return text ? [text] : [];
    }
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      // 计算当前块的结束位置
      let end = start + chunkSize;
      
      // 如果不是最后一块，尝试在句子边界处断开
      if (end < text.length) {
        // 查找最后一个句子边界（。！？；）
        const lastBoundary = Math.max(
          text.lastIndexOf('。', end),
          text.lastIndexOf('！', end),
          text.lastIndexOf('？', end),
          text.lastIndexOf('；', end),
          text.lastIndexOf('\n', end)
        );
        
        // 如果找到的边界在合理范围内（当前位置往前100个字符内），在那里断开
        if (lastBoundary > start && lastBoundary > end - 100) {
          end = lastBoundary + 1;
        } else {
          // 否则在空格处断开
          const lastSpace = text.lastIndexOf(' ', end);
          if (lastSpace > start && lastSpace > end - 50) {
            end = lastSpace;
          }
        }
      }
      
      // 提取块
      const chunk = text.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      
      // 移动起始位置（考虑重叠）
      start = end - overlap;
      
      // 防止无限循环
      if (start <= 0 || start >= text.length) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * 智能分块 - 保留更完整的语义单元
   * @param {string} text - 原始文本
   * @param {number} chunkSize - 每块的字符数（默认1000）
   * @param {number} overlap - 块重叠大小（默认100）
   * @returns {string[]} 文本块列表
   */
  static smartSplit(text, chunkSize = 1000, overlap = 100) {
    if (!text || text.length <= chunkSize) {
      return text ? [text] : [];
    }
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      let end = start + chunkSize;
      
      // 优先在段落分隔处断开
      if (end < text.length) {
        // 查找最后一个段落结束（双换行）
        const lastParagraph = text.lastIndexOf('\n\n', end);
        if (lastParagraph > start && lastParagraph > end - 200) {
          end = lastParagraph + 2;
        }
        // 其次在句子边界断开
        else {
          const sentenceBoundaries = ['。', '！', '？', '；', '\n'];
          let lastBoundary = -1;
          
          for (const boundary of sentenceBoundaries) {
            const idx = text.lastIndexOf(boundary, end);
            if (idx > lastBoundary) {
              lastBoundary = idx;
            }
          }
          
          if (lastBoundary > start && lastBoundary > end - 150) {
            end = lastBoundary + 1;
          }
        }
      }
      
      const chunk = text.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      
      start = end - overlap;
      if (start <= 0 || start >= text.length) {
        break;
      }
    }
    
    return chunks;
  }

  /**
   * 估算文本的 token 数量（粗略估算）
   * @param {string} text - 文本
   * @returns {number} 估算的 token 数量
   */
  static estimateTokens(text) {
    if (!text) return 0;
    // 中文大约每个字符 1 token，英文大约 4 字符 1 token
    // 简单估算：中文字符 + 英文单词/4
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + Math.ceil(englishWords / 4);
  }

  /**
   * 根据 token 数量估算合适的块大小
   * @param {number} totalTokens - 总 token 数量
   * @param {number} targetChunks - 目标块数量
   * @returns {object} { chunkSize, chunkCount }
   */
  static calculateChunkParams(totalTokens, targetChunks = 10) {
    const tokensPerChunk = Math.ceil(totalTokens / targetChunks);
    // 假设平均每个汉字 1 token，每个英文单词 0.25 token
    // 转换为字符数（假设中英文混合）
    const chunkSize = Math.min(Math.max(tokensPerChunk * 2, 200), 2000);
    const chunkCount = Math.ceil(totalTokens / tokensPerChunk);
    
    return {
      chunkSize,
      chunkCount,
      overlap: Math.floor(chunkSize * 0.1) // 10% 重叠
    };
  }

  /**
   * 清理 HTML 内容
   * @param {string} html - HTML 内容
   * @returns {string} 清理后的文本
   */
  static stripHtml(html) {
    if (!html) return '';
    
    // 移除脚本和样式
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '\n');
    
    // 转换实体
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/</g, '<');
    text = text.replace(/>/g, '>');
    text = text.replace(/&/g, '&');
    text = text.replace(/"/g, '"');
    
    // 清理
    text = this.preprocessText(text);
    
    return text;
  }

  /**
   * 提取关键句子
   * @param {string} text - 文本
   * @param {number} count - 要提取的句子数
   * @returns {string[]} 关键句子列表
   */
  static extractKeySentences(text, count = 5) {
    if (!text) return [];
    
    // 按句子分割
    const sentences = text.split(/[。！？；\n]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length <= count) {
      return sentences;
    }
    
    // 简单评分：包含关键词的句子更重要
    const keywords = this.extractKeywords(text, 10);
    
    const scored = sentences.map(sentence => {
      let score = 0;
      for (const keyword of keywords) {
        if (sentence.includes(keyword)) {
          score += 1;
        }
      }
      return { sentence, score };
    });
    
    // 排序并返回 top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map(s => s.sentence);
  }

  /**
   * 提取关键词（简单实现）
   * @param {string} text - 文本
   * @param {number} count - 要提取的关键词数
   * @returns {string[]} 关键词列表
   */
  static extractKeywords(text, count = 10) {
    if (!text) return [];
    
    // 移除停用词并统计词频
    const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '它', '她', '他', '们', '把', '被', '让', '给', '向', '从', '与', '及', '等', '或', '但', '而', '所以', '因为', '如果', '虽然', '可以', '这个', '那个']);
    
    // 分词（简单按字符）
    const words = text.split(/[，。！？；：、""''（）【】《》\s,.\?!:;"'()[\]]+/);
    
    const wordCount = {};
    for (const word of words) {
      const cleaned = word.trim();
      if (cleaned.length >= 2 && !stopWords.has(cleaned)) {
        wordCount[cleaned] = (wordCount[cleaned] || 0) + 1;
      }
    }
    
    // 排序并返回 top N
    const sorted = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word]) => word);
    
    return sorted;
  }
}

export default TextProcessor;