import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // node 环境即可覆盖纯逻辑 composable；如需 DOM 组件测试再引入 jsdom
    environment: 'node',
    include: ['src/**/*.test.js'],
    globals: true
  }
})
