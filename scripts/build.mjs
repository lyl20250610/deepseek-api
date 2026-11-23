import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = path.join(root, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js')

// rspack 的 output.clean 已负责清理 dist，无需再单独删除（也避免重复 IO 与权限问题）。

const child = spawn(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
