import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 2026-08-10：相对 base，兼容 GitHub Pages 子路径 / 腾讯托管 / 本地 serve 任意目录部署
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
