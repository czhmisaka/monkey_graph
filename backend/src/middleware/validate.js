/**
 * zod 输入校验中间件
 * 为高风险写接口提供声明式 schema 校验，拒绝畸形请求体
 * 用法: router.post('/x', validate(schema), handler)
 */

import { z } from 'zod';

// ========== 共享 schema ==========

export const idSchema = z.string().min(1).max(100);

export const nodeSchema = z.object({
  id: z.string().max(100).optional(),
  label: z.string().max(500).optional(),
  type: z.string().max(100).optional(),
  properties: z.record(z.unknown()).optional(),
  x: z.number().optional(),
  y: z.number().optional()
});

export const edgeSchema = z.object({
  id: z.string().max(100).optional(),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  label: z.string().max(500).optional(),
  type: z.string().max(100).optional(),
  properties: z.record(z.unknown()).optional()
});

export const graphCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional()
});

export const agentRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  workspace_id: z.string().max(100).optional()
  // 注意: 权限/配额/限流不允许客户端传入（服务端默认值）
});

export const userRegisterSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, '用户名仅允许字母、数字、下划线'),
  password: z.string().min(8).max(100)
});

export const userLoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(100)
});

export const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string()
  })).min(1).max(100),
  graphId: z.string().min(1).max(100),
  maxIterations: z.number().int().min(1).max(20).optional()
});

/**
 * 校验中间件工厂
 * 校验失败返回 400 + 具体错误字段
 */
export function validate(schema, options = {}) {
  const { stripUnknown = false } = options;
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        field: i.path.join('.') || '(root)',
        message: i.message
      }));
      return res.status(400).json({
        error: '请求参数校验失败',
        code: 'VALIDATION_FAILED',
        issues
      });
    }
    if (stripUnknown) {
      req.body = result.data;
    }
    next();
  };
}

export default { validate, nodeSchema, edgeSchema, graphCreateSchema, agentRegisterSchema, chatSchema };
