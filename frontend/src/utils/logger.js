/**
 * 前端日志工具 - 收集控制台日志并在内存中存储
 */

// 日志存储
const logStore = {
  logs: [],
  maxLogs: 500
};

// 日志级别
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// 当前日志级别
const currentLevel = localStorage.getItem('LOG_LEVEL') || 'info';

/**
 * 添加日志到存储
 */
function addLog(level, args) {
  const timestamp = new Date().toISOString();
  let message = '';
  
  for (const arg of args) {
    if (typeof arg === 'object') {
      try {
        message += JSON.stringify(arg) + ' ';
      } catch (e) {
        message += String(arg) + ' ';
      }
    } else {
      message += String(arg) + ' ';
    }
  }
  
  const logEntry = {
    id: Date.now() + Math.random(),
    timestamp,
    level,
    message: message.trim(),
    source: 'browser'
  };
  
  logStore.logs.push(logEntry);
  
  // 限制日志数量
  if (logStore.logs.length > logStore.maxLogs) {
    logStore.logs.shift();
  }
  
  return logEntry;
}

// 原始控制台方法
const originalConsole = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
  log: console.log
};

// 劫持控制台方法
function hijackConsole() {
  if (typeof window === 'undefined') return;
  
  console.error = (...args) => {
    addLog('error', args);
    originalConsole.error.apply(console, args);
  };
  
  console.warn = (...args) => {
    addLog('warn', args);
    originalConsole.warn.apply(console, args);
  };
  
  console.info = (...args) => {
    addLog('info', args);
    originalConsole.info.apply(console, args);
  };
  
  console.debug = (...args) => {
    addLog('debug', args);
    originalConsole.debug.apply(console, args);
  };
  
  console.log = (...args) => {
    addLog('info', args);
    originalConsole.log.apply(console, args);
  };
  
  // 监听未捕获的错误
  window.addEventListener('error', (event) => {
    addLog('error', [`Uncaught Error: ${event.message}`, `at ${event.filename}:${event.lineno}`]);
  });
  
  // 监听 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
  });
}

// 初始化
hijackConsole();

// 导出日志工具
export const logger = {
  error: (...args) => {
    addLog('error', args);
    originalConsole.error.apply(console, args);
  },
  warn: (...args) => {
    addLog('warn', args);
    originalConsole.warn.apply(console, args);
  },
  info: (...args) => {
    addLog('info', args);
    originalConsole.info.apply(console, args);
  },
  debug: (...args) => {
    addLog('debug', args);
    originalConsole.debug.apply(console, args);
  },
  
  /**
   * 获取所有日志
   */
  getLogs() {
    return [...logStore.logs];
  },
  
  /**
   * 获取指定级别的日志
   */
  getLogsByLevel(level) {
    return logStore.logs.filter(log => log.level === level);
  },
  
  /**
   * 搜索日志
   */
  searchLogs(keyword) {
    if (!keyword) return logStore.logs;
    const lower = keyword.toLowerCase();
    return logStore.logs.filter(log => 
      log.message.toLowerCase().includes(lower)
    );
  },
  
  /**
   * 清空日志
   */
  clearLogs() {
    logStore.logs = [];
  },
  
  /**
   * 导出日志
   */
  exportLogs() {
    return JSON.stringify(logStore.logs, null, 2);
  },
  
  /**
   * 下载日志文件
   */
  downloadLogs() {
    const content = logger.exportLogs();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monkeygraph-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

export default logger;