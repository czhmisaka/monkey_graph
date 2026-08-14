import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置 multer 用于文件上传
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成安全的文件名：时间戳 + 随机数，不保留原始扩展名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 从允许的扩展名列表中获取，确保安全
    const allowedExts = ['.pdf', '.md', '.txt'];
    const originalExt = path.extname(file.originalname).toLowerCase();
    const ext = allowedExts.includes(originalExt) ? originalExt : '.bin';
    cb(null, uniqueSuffix + ext);
  }
});

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.txt'];

// 允许的 MIME 类型
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream' // 某些系统可能返回这个
];

// 文件魔数（Magic Bytes）定义
const FILE_SIGNATURES = {
  // PDF: %PDF- (十六进制: 25 50 44 46 2D)
  pdf: {
    signature: [0x25, 0x50, 0x44, 0x46], // %PDF
    offset: 0,
    description: 'PDF'
  }
};

/**
 * 验证文件扩展名
 * @param {string} filename - 文件名
 * @returns {boolean} - 是否允许
 */
const isAllowedExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
};

/**
 * 验证 MIME 类型
 * @param {string} mimeType - MIME 类型
 * @returns {boolean} - 是否允许
 */
const isAllowedMimeType = (mimeType) => {
  return ALLOWED_MIME_TYPES.includes(mimeType);
};

/**
 * 读取文件头部字节
 * @param {string} filePath - 文件路径
 * @param {number} bytesToRead - 要读取的字节数
 * @returns {Buffer|null} - 文件头部内容或 null
 */
const readFileHeader = (filePath, bytesToRead = 8) => {
  try {
    // 使用文件描述符同步读取
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);
    fs.closeSync(fd);
    return bytesRead > 0 ? buffer.slice(0, bytesRead) : null;
  } catch (error) {
    logger.error('【Upload】', '[Upload] 读取文件头失败:', error.message);
    return null;
  }
};

/**
 * 验证文件魔数（Magic Bytes）
 * @param {string} filePath - 文件路径
 * @param {string} expectedExtension - 期望的文件扩展名
 * @returns {{ valid: boolean, message: string }} - 验证结果
 */
const verifyFileMagicBytes = (filePath, expectedExtension) => {
  const header = readFileHeader(filePath, 8);
  
  if (!header) {
    return { valid: false, message: '无法读取文件内容' };
  }
  
  // 根据扩展名验证魔数
  switch (expectedExtension.toLowerCase()) {
    case '.pdf':
      // PDF 文件必须以 %PDF 开头
      if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) {
        return { valid: true, message: 'PDF 魔数验证通过' };
      }
      return { valid: false, message: '文件内容不是有效的 PDF 格式' };
    
    case '.md':
    case '.txt':
      // 文本文件应该是可打印的 ASCII 字符或 UTF-8 编码
      // 检查是否包含非文本字符（二进制特征）
      let hasBinaryContent = false;
      let printableCount = 0;
      
      for (let i = 0; i < Math.min(header.length, 8); i++) {
        const byte = header[i];
        // 可打印 ASCII (32-126) 或常见控制字符 (9=Tab, 10=LF, 13=CR)
        if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
          printableCount++;
        } else if (byte !== 0) {
          // 0 可能出现在 UTF-8 编码中，但连续的二进制内容表示这不是文本
          hasBinaryContent = true;
        }
      }
      
      // 如果大部分是可打印字符，认为是文本文件
      if (printableCount >= 4 && !hasBinaryContent) {
        return { valid: true, message: '文本文件魔数验证通过' };
      }
      return { valid: false, message: '文件内容不是有效的文本格式' };
    
    default:
      return { valid: true, message: '无需验证' };
  }
};

/**
 * 清理文件名，移除危险字符
 * @param {string} filename - 原始文件名
 * @returns {string} - 清理后的文件名
 */
const sanitizeFilename = (filename) => {
  // 只保留字母、数字、下划线、连字符、点和空格
  return filename.replace(/[^a-zA-Z0-9._\s-]/g, '_').substring(0, 255);
};

/**
 * 临时文件清理函数
 * @param {string} filePath - 文件路径
 */
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.error('【Upload】', '[Upload] 清理临时文件失败:', error.message);
  }
};

export const upload = multer({
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB 限制
    files: 10 // 最多 10 个文件
  },
  fileFilter: (req, file, cb) => {
    // 1. 验证文件扩展名
    if (!isAllowedExtension(file.originalname)) {
      logger.warn('【Upload】', `[Upload] 拒绝文件：无效的扩展名 ${file.originalname}`);
      return cb(new Error('不支持的文件扩展名，仅支持 PDF、MD、TXT'));
    }
    
    // 2. 验证 MIME 类型
    if (!isAllowedMimeType(file.mimetype)) {
      logger.warn('【Upload】', `[Upload] 拒绝文件：无效的 MIME 类型 ${file.mimetype}`);
      return cb(new Error('不支持的文件类型，仅支持 PDF、MD、TXT'));
    }
    
    // 3. 验证文件魔数 (Magic Bytes) - 在文件写入后验证
    // 注意：multer 在 fileFilter 中还没有写入文件，所以我们需要在上传处理中验证
    // 这里标记期望的扩展名供后续验证使用
    const ext = path.extname(file.originalname).toLowerCase();
    file._expectedExtension = ext;
    
    // 清理文件名
    file.originalname = sanitizeFilename(file.originalname);
    
    cb(null, true);
  }
});

/**
 * 验证上传文件的安全中间件
 * 在文件上传后调用，验证文件魔数
 */
export const verifyUploadFile = (req, res, next) => {
  if (!req.file && !req.files) {
    return next();
  }
  
  const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : [req.file];
  
  for (const file of files) {
    if (!file || !file.path) continue;
    
    const ext = file._expectedExtension || path.extname(file.originalname).toLowerCase();
    const result = verifyFileMagicBytes(file.path, ext);
    
    if (!result.valid) {
      logger.warn('【Upload】', `[Upload] 文件魔数验证失败: ${file.originalname} - ${result.message}`);
      // 删除不安全的文件
      cleanupTempFile(file.path);
      return res.status(400).json({ 
        error: '文件验证失败', 
        details: result.message,
        filename: file.originalname
      });
    }
    
    logger.info('【Upload】', `[Upload] 文件验证通过: ${file.originalname} - ${result.message}`);
  }
  
  next();
};
