import { spawn } from 'node:child_process'
import process from 'node:process'

const isWindows = process.platform === 'win32'

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
  })

const root = new URL('..', import.meta.url)
const gradle = isWindows ? 'gradlew.bat' : './gradlew'

try {
  await run('pnpm', ['build'], { cwd: root })
  await run('pnpm', ['exec', 'cap', 'sync', 'android'], { cwd: root })
  await run(gradle, ['assembleDebug'], { cwd: new URL('../android', import.meta.url) })
  console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
