// 日志域 API (logsAPI)
import { api } from '../core.js'

// 日志 API
export const logsAPI = {
  /**
   * 获取日志文件列表
   */
  getFiles() {
    return api.get('/logs/files')
  },
  
  /**
   * 读取日志文件
   * @param {string} file - 文件名
   * @param {number} lines - 行数
   */
  readFile(file, lines = 100) {
    return api.get(`/logs/read?file=${encodeURIComponent(file)}&lines=${lines}`)
  },
  
  /**
   * 获取最近的日志
   * @param {number} count - 日志数量
   */
  getRecent(count = 50) {
    return api.get(`/logs/recent?count=${count}`)
  },
  
  /**
   * 清理日志文件
   */
  clearLogs() {
    return api.post('/logs/clear')
  }
}
