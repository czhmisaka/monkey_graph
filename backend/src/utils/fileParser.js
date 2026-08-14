import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 文件解析器 - 从各种格式的文件中提取文本内容
 */
export class FileParser {
  /**
   * 从文件中提取纯文本内容
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} 提取的文本内容
   */
  static async extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return await this.extractFromPDF(filePath);
      case '.md':
      case '.markdown':
        return await this.extractFromMarkdown(filePath);
      case '.txt':
        return await this.extractFromText(filePath);
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  /**
   * 从 PDF 文件提取文本
   * @param {string} filePath - PDF 文件路径
   * @returns {Promise<string>} 提取的文本
   */
  static async extractFromPDF(filePath) {
    try {
      // 动态导入 CommonJS 模块 (pdf-parse 是 commonjs 模块)
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default;
      
      const dataBuffer = fs.readFileSync(filePath);
      
      let data = await pdfParse(dataBuffer);
      let text = data.text || '';
      
      // 检查文本质量
      const qualityCheck = this.checkTextQuality(text);
      logger.info('【FileParser】', 'PDF 解析质量检查:', qualityCheck);
      
      return text;
    } catch (error) {
      logger.error('【FileParser】', 'PDF 解析失败:', error);
      throw new Error(`PDF 解析失败: ${error.message}`);
    }
  }
  
  /**
   * 检查文本质量 - 检测乱码和无效内容
   * @param {string} text - 待检查的文本
   * @returns {object} { isValid: boolean, issues: string[] }
   */
  static checkTextQuality(text) {
    const issues = [];
    
    if (!text || text.trim().length === 0) {
      issues.push('文本为空');
      return { isValid: false, issues };
    }
    
    // 检查乱码字符（替换字符）
    const replacementCharCount = (text.match(/\ufffd/g) || []).length;
    if (replacementCharCount > 0) {
      issues.push(`包含 ${replacementCharCount} 个替换字符`);
    }
    
    // 检查非可读字符的比例
    const readableChars = text.replace(/[\r\n\t\s]/g, '').length;
    const totalChars = text.length;
    
    // 如果可读字符少于 20%，认为质量不好
    if (readableChars < totalChars * 0.2) {
      issues.push(`可读字符比例过低: ${(readableChars / totalChars * 100).toFixed(1)}%`);
    }
    
    // 检查是否包含常见乱码模式
    const garbledPatterns = [
      /å¯æ¬/,
      /å¾­/,
      /ç»/,
      /ä¸/,
      /µæ/,
      /±¬/
    ];
    
    for (const pattern of garbledPatterns) {
      if (pattern.test(text)) {
        issues.push('检测到常见乱码模式');
        break;
      }
    }
    
    const isValid = issues.length === 0;
    return { isValid, issues };
  }

  /**
   * 从 Markdown 文件提取文本
   * @param {string} filePath - Markdown 文件路径
   * @returns {Promise<string>} 提取的文本
   */
  static async extractFromMarkdown(filePath) {
    try {
      // 尝试多种编码
      const encodings = ['utf-8', 'gbk', 'gb2312', 'big5'];
      
      for (const encoding of encodings) {
        try {
          const content = fs.readFileSync(filePath, encoding);
          return this.preprocessMarkdown(content);
        } catch (e) {
          continue;
        }
      }
      
      // 最终兜底
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error('【FileParser】', 'Markdown 解析失败:', error);
      throw new Error(`Markdown 解析失败: ${error.message}`);
    }
  }

  /**
   * 从文本文件提取内容
   * @param {string} filePath - 文本文件路径
   * @returns {Promise<string>} 提取的文本
   */
  static async extractFromText(filePath) {
    try {
      const encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'latin1'];
      
      for (const encoding of encodings) {
        try {
          let content = fs.readFileSync(filePath, encoding);
          // 替换无法识别的字符
          content = content.replace(/\ufffd/g, '');
          return content.trim();
        } catch (e) {
          continue;
        }
      }
      
      // 最终兜底
      return fs.readFileSync(filePath, 'utf-8', { errors: 'replace' });
    } catch (error) {
      logger.error('【FileParser】', '文本文件解析失败:', error);
      throw new Error(`文本文件解析失败: ${error.message}`);
    }
  }

  /**
   * 预处理 Markdown - 移除一些标记但保留结构
   * @param {string} content - Markdown 内容
   * @returns {string} 处理后的文本
   */
  static preprocessMarkdown(content) {
    // 移除图片语法
    let text = content.replace(/!\[.*?\]\(.*?\)/g, '');
    
    // 移除链接但保留文本
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // 移除标题标记但保留文字
    text = text.replace(/^#{1,6}\s+/gm, '');
    
    // 移除代码块
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`[^`]+`/g, '');
    
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    
    return text.trim();
  }

  /**
   * 获取文件信息
   * @param {object} file - 上传的文件对象
   * @returns {object} 文件信息
   */
  static getFileInfo(file) {
    return {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    };
  }

  /**
   * 验证文件类型
   * @param {string} filename - 文件名
   * @returns {boolean} 是否支持
   */
  static isAllowed(filename) {
    const allowedExtensions = ['.pdf', '.md', '.markdown', '.txt'];
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  }
}

export default FileParser;