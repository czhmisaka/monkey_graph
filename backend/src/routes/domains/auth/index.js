import express from 'express';
import { userOperations } from '../../../database.js';
import { authMiddleware, generateToken, setAuthCookie, clearAuthCookie } from '../../../auth.js';
import { loginRateLimiter, registerRateLimiter } from '../../../middleware/rateLimit.js';

const router = express.Router();

// 用户注册
router.post('/auth/register', registerRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 个字符' });
    }

    const existingUser = userOperations.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const newUser = await userOperations.create({ username, password });
    const token = generateToken(newUser);
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 用户登录
router.post('/auth/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = userOperations.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (!await userOperations.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    res.json({
      success: true,
      user: { id: user.id, username: user.username, is_admin: user.is_admin }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 注销
router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: '已退出登录' });
});

// 获取当前用户信息
router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: req.user
  });
});

// 更新用户资料
router.put('/auth/profile', authMiddleware, (req, res) => {
  try {
    const { username, avatar, bio } = req.body;

    // 如果要修改用户名，检查是否已存在
    if (username && username !== req.user.username) {
      const existingUser = userOperations.findByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: '用户名已被使用' });
      }
    }

    const updatedUser = userOperations.updateProfile(req.user.id, { username, avatar, bio });
    res.json({
      success: true,
      user: { id: updatedUser.id, username: updatedUser.username, avatar: updatedUser.avatar, bio: updatedUser.bio }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;