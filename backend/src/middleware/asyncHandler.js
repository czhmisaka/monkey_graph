/**
 * asyncHandler - Express 4 异步错误处理包装器
 * Express 4 不会捕获 async handler 中的 rejection，会导致请求悬挂。
 * 用此包装器统一将 rejection 转发到 next(err)，由 errorHandler 处理。
 *
 * 用法: router.get('/x', asyncHandler(async (req, res) => { ... }))
 */

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
