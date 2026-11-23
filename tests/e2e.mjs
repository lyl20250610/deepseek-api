import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(root, '../dist')
const shots = path.resolve(root, 'screenshots')
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
await mkdir(shots, { recursive: true })

const sse = (() => {
  const events = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_mock_1',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-flash',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 28,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
          },
        },
      },
    },
    {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '你好！我是 DeepSeek，很高兴见到你。\n\n' },
      },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: '这是移动端回归测试中的模拟流式回复，用于验证输入、SSE 解析和 Markdown 渲染。',
        },
      },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null, title: '介绍 DeepSeek' },
        usage: {
          input_tokens: 28,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 42,
        },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]
  return events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
})()

const browser = await chromium.launch({ executablePath: chrome, headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  colorScheme: 'light',
  serviceWorkers: 'block',
})

const page = await context.newPage()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  }
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

await page.addInitScript(() => {
  localStorage.setItem('chat-demo:api-key', 'sk-regression-test')
  localStorage.setItem('chat-demo:locale', 'zh-CN')
})

let apiRequest = null
await page.route('https://api.deepseek.com/**', async (route) => {
  const request = route.request()
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '86400',
  }
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers })
    return
  }
  if (request.url().endsWith('/anthropic/v1/messages')) {
    apiRequest = request
    await route.fulfill({
      status: 200,
      headers: {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: sse,
    })
    return
  }
  await route.fulfill({
    status: 200,
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ object: 'list', data: [] }),
  })
})

const screenshot = (name) =>
  page.screenshot({ path: path.join(shots, name), animations: 'disabled' })

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' })
  await page.getByText('今天有什么可以帮到你？').waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
  assert.equal(await page.title(), 'deepseek手机api版')
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), './manifest.webmanifest')
  await screenshot('01-welcome-light.png')

  // 模拟 Capacitor SystemBars 注入的安全区，确认顶栏和输入区都让出了状态栏/手势区。
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px')
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
  })
  await page.waitForTimeout(80)
  const safeHeader = await page.getByRole('button', { name: '打开边栏' }).boundingBox()
  assert(safeHeader && safeHeader.y >= 24, 'header should start below injected status bar')
  await screenshot('02-welcome-safe-area.png')
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--safe-area-inset-top')
    document.documentElement.style.removeProperty('--safe-area-inset-bottom')
  })

  const textbox = page.getByRole('textbox')
  await textbox.fill('你好，介绍一下你自己')
  const requestPromise = page.waitForRequest(
    (request) => request.url().endsWith('/anthropic/v1/messages') && request.method() === 'POST'
  )
  await page.getByRole('button', { name: '发送' }).click()
  const request = await requestPromise
  const payload = request.postDataJSON()
  assert.equal(payload.stream, true)
  assert.equal(payload.model, 'deepseek-flash')
  assert.equal(payload.title.enabled, true)
  assert(JSON.stringify(payload.messages.at(-1)).includes('介绍一下你自己'))

  await page.getByText('很高兴见到你', { exact: false }).waitFor()
  await page.getByText('介绍 DeepSeek', { exact: true }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: '发送' }).count(), 1)
  await screenshot('03-chat-light.png')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  assert(overflow <= 1, `horizontal overflow: ${overflow}px`)

  await page.getByRole('button', { name: '打开边栏' }).click()
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByText('修改 API Key').waitFor()
  await screenshot('04-settings-data.png')
  assert.equal(await page.getByRole('tab', { name: '数据管理' }).getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Escape')

  await page.evaluate(() => localStorage.setItem('chat-demo:theme-preference', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('今天有什么可以帮到你？').waitFor()
  assert.equal(await page.evaluate(() => document.body.classList.contains('dark')), true)
  const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
  assert.notEqual(themeColor, '#ffffff')
  await screenshot('05-welcome-dark.png')

  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join('\n')}`)
  console.log('E2E PASS')
  console.log(`screenshots: ${shots}`)
  console.log(`last request: ${apiRequest?.url()}`)
} finally {
  await browser.close()
  server.close()
}
