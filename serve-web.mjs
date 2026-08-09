// 六爻工作台 Web 版静态服务器（零依赖，Node 内置模块）
// 用法：node serve-web.mjs [端口]   （默认 8742）
// 功能：服务 dist/ 目录，SPA 路由回退，自动打开浏览器
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const PORT = Number(process.argv[2]) || 8742
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname)
    // 防目录穿越
    let filePath = normalize(join(ROOT, urlPath))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return
    }

    let fstat
    try {
      fstat = await stat(filePath)
    } catch {
      fstat = null
    }
    // 目录 → index.html；静态文件不存在 → SPA 回退 index.html
    if (fstat && fstat.isDirectory()) filePath = join(filePath, 'index.html')
    else if (!fstat) filePath = join(ROOT, 'index.html')

    const data = await readFile(filePath)
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
    })
    res.end(data)
  } catch (err) {
    res.writeHead(500); res.end('Server error: ' + err.message)
  }
})

/** 启动监听：端口被占用时自动改用下一个端口（最多尝试 5 个），避免 EADDRINUSE 直接崩溃 */
function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 4) {
      console.log(`  ⚠ 端口 ${port} 已被占用，自动改用 ${port + 1}...`)
      listen(port + 1)
    } else {
      console.error('\n  启动失败：' + err.message)
      console.error('  可运行 node serve-web.mjs <端口号> 手动指定其他端口（如 9000）\n')
      process.exit(1)
    }
  })
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/`
    console.log('')
    console.log('  六爻工作台 · Web 版已启动')
    console.log(`  ➜  ${url}`)
    console.log('  关闭本窗口即可退出服务器')
    console.log('')
    // 自动打开浏览器（Windows）
    exec(`start "" "${url}"`, { shell: true })
  })
}

listen(PORT)
