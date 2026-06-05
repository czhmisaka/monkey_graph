import { v4 as uuidv4 } from 'uuid';

// 内存中的任务存储
const tasks = new Map();

/**
 * 任务状态
 */
export const TaskStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

/**
 * 任务管理器 - 跟踪异步任务进度
 */
export class TaskManager {
  /**
   * 创建新任务
   * @param {string} type - 任务类型
   * @param {Object} data - 任务数据
   * @returns {string} 任务ID
   */
  static createTask(type, data = {}) {
    const taskId = `task_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    
    tasks.set(taskId, {
      taskId,
      type,
      status: TaskStatus.PENDING,
      progress: 0,
      message: '任务已创建',
      data,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    return taskId;
  }

  /**
   * 更新任务进度
   * @param {string} taskId - 任务ID
   * @param {number} progress - 进度 (0-1)
   * @param {string} message - 进度消息
   */
  static updateProgress(taskId, progress, message) {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = TaskStatus.PROCESSING;
    task.progress = Math.min(Math.max(progress, 0), 1);
    task.message = message || '';
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 完成任务
   * @param {string} taskId - 任务ID
   * @param {Object} result - 任务结果
   */
  static completeTask(taskId, result) {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = TaskStatus.COMPLETED;
    task.progress = 1;
    task.message = '任务完成';
    task.result = result;
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 任务失败
   * @param {string} taskId - 任务ID
   * @param {string} error - 错误信息
   */
  static failTask(taskId, error) {
    const task = tasks.get(taskId);
    if (!task) return;
    
    task.status = TaskStatus.FAILED;
    task.message = '任务失败';
    task.error = error;
    task.updatedAt = new Date().toISOString();
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 任务信息
   */
  static getTask(taskId) {
    return tasks.get(taskId) || null;
  }

  /**
   * 获取所有任务
   * @returns {Object[]} 任务列表
   */
  static getAllTasks() {
    return Array.from(tasks.values());
  }

  /**
   * 清理过期任务（超过24小时）
   */
  static cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    
    for (const [taskId, task] of tasks.entries()) {
      const taskTime = new Date(task.createdAt).getTime();
      if (now - taskTime > maxAge) {
        tasks.delete(taskId);
      }
    }
  }

  /**
   * 删除任务
   * @param {string} taskId - 任务ID
   */
  static deleteTask(taskId) {
    tasks.delete(taskId);
  }
}

// 定期清理过期任务
setInterval(() => {
  TaskManager.cleanup();
}, 60 * 60 * 1000); // 每小时清理一次

export default TaskManager;