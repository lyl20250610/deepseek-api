import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
]

const fullBleedBackground =
  '<background android:drawable="@mipmap/ic_launcher_background" />'

for (const relative of files) {
  const file = resolve(root, relative)
  const source = await readFile(file, 'utf8')
  if (!source.includes('<background')) {
    throw new Error(`${relative}: no adaptive-icon background found`)
  }
  const patched = source.replace(
    /<background[\s\S]*?<\/background>|<background[^>]*\/>/,
    fullBleedBackground,
  )
  await writeFile(file, patched)
  console.log(`patched ${relative}`)
}
