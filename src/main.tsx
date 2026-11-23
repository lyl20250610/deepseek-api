import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { initNativeShell } from './services/native.js'
import { checkForUpdate } from './services/hotUpdate.js'
import { registerServiceWorker } from './services/pwa.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
initNativeShell()
registerServiceWorker()
// 延迟到首屏渲染后再检查更新，避免网络检查影响启动速度；页面卸载时中止请求。
const updateAbort = new AbortController()
window.setTimeout(() => checkForUpdate(updateAbort.signal), 1500)
window.addEventListener('pagehide', () => updateAbort.abort(), { once: true })
