import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(root, '../dist')
const chrome =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = path.resolve(dist, relative)
    if (!file.startsWith(dist + path.sep)) {
      response.writeHead(403).end()
      return
    }
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(500).end()
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const appUrl = `http://localhost:${port}/`

const browser = await chromium.launch({ executablePath: chrome, headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  serviceWorkers: 'allow',
})
const page = await context.newPage()
await page.addInitScript(() => {
  localStorage.setItem('chat-demo:api-key', 'sk-offline-test')
  localStorage.setItem('chat-demo:locale', 'zh-CN')
})

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  // The install step parses index.html and precaches its hashed JS/CSS, so the
  // very first offline reload must work without a second online visit.
  await page.waitForFunction(async () => {
    const cache = await caches.open('ds-mobile-v2')
    return (await cache.keys()).length >= 8
  })
  await page.getByText('今天有什么可以帮到你？').waitFor()

  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const cache = await caches.open('ds-mobile-v2')
    const requests = await cache.keys()
    return { names, count: requests.length, paths: requests.map((request) => request.url) }
  })
  assert(cached.count >= 5, `service worker cache too small: ${JSON.stringify(cached)}`)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('今天有什么可以帮到你？').waitFor({ timeout: 15000 })
  assert.equal(await page.title(), 'deepseek手机api版')

  const offlineIcon = await page.evaluate(async () => {
    const response = await fetch('./icons/icon-192.png')
    return response.status
  })
  assert.equal(offlineIcon, 200)
  console.log('PWA OFFLINE PASS')
  console.log(`cached requests: ${cached.count}`)
} finally {
  await browser.close()
  server.close()
}
