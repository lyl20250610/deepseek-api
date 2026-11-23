import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = path.join(root, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js')
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version
const updateBase = process.env.UPDATE_BASE_URL ?? ''

// rspack 的 output.clean 已负责清理 dist，无需再单独删除（也避免重复 IO 与权限问题）。
const child = spawn(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', UPDATE_BASE_URL: updateBase },
  stdio: 'inherit',
})

const exitCode = await new Promise((resolve) => {
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    resolve(code ?? 1)
  })
})
if (exitCode !== 0) {
  process.exit(exitCode)
}

/** 递归列出 dist 下的文件，排除更新包自身，避免自我嵌套。 */
const listFiles = async (dir, prefix = '') => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(dir, entry.name), relative)))
    } else if (entry.isFile() && relative !== 'version.json' && relative !== 'bundle.zip') {
      files.push(relative)
    }
  }
  return files
}

if (updateBase) {
  const dist = path.join(root, 'dist')
  const files = await listFiles(dist)
  const entries = {}
  for (const relative of files) {
    entries[relative] = new Uint8Array(await readFile(path.join(dist, relative)))
  }
  const zipBuffer = zipSync(entries, { level: 6 })
  await writeFile(path.join(dist, 'bundle.zip'), zipBuffer)
  const sha256 = createHash('sha256').update(zipBuffer).digest('hex')
  await writeFile(
    path.join(dist, 'version.json'),
    `${JSON.stringify({ version, bundle: 'bundle.zip', sha256 }, null, 2)}\n`
  )
  console.log(`Update package: version ${version}, ${files.length} files, sha256 ${sha256}`)
} else {
  console.log('UPDATE_BASE_URL is empty; skipped update package generation.')
}
