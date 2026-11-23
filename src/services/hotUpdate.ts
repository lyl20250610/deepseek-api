import { Capacitor, registerPlugin } from '@capacitor/core'
import { showToast } from '../components/base/toastState.js'

/**
 * 前端热更新：启动时向 GitHub Pages 检查 version.json，发现新版本则下载 zip 更新包，
 * 交给原生插件解压并切换到可写目录。下次启动生效；任何失败都静默回退到 APK 内置资源。
 */

type HotUpdatePluginType = {
  getVersion(): Promise<{ version: string }>
  install(options: { zipBase64: string; version: string }): Promise<{ version: string }>
  reset(): Promise<void>
}

/** Web 端不实现，registerPlugin 在未实现的平台上调用会抛错，调用处按平台守卫。 */
const HotUpdate = registerPlugin<HotUpdatePluginType>('HotUpdate')

/** 构建期注入；本地开发为空串，不触发更新检查。 */
declare const __UPDATE_BASE_URL__: string
declare const __APP_VERSION__: string

const CHECK_TIMEOUT_MS = 6000
const DOWNLOAD_TIMEOUT_MS = 20000
const MAX_ZIP_BYTES = 12 * 1024 * 1024

const VERSION_RE = /^\d+\.\d+\.\d+$/
const compareVersions = (a: string, b: string): number => {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const delta = (partsA[index] ?? 0) - (partsB[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

const withTimeout = (signal: AbortSignal, ms: number): AbortSignal =>
  AbortSignal.any([signal, AbortSignal.timeout(ms)])

type VersionInfo = { version: string; bundle: string; sha256?: string }

const readVersion = async (signal: AbortSignal): Promise<VersionInfo | null> => {
  const base = __UPDATE_BASE_URL__.replace(/\/$/, '')
  if (!base) {
    return null
  }
  const response = await fetch(`${base}/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    signal: withTimeout(signal, CHECK_TIMEOUT_MS),
  })
  if (!response.ok) {
    return null
  }
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const record = data as Record<string, unknown>
  if (typeof record.version !== 'string' || !VERSION_RE.test(record.version)) {
    return null
  }
  const bundle = typeof record.bundle === 'string' ? record.bundle : 'bundle.zip'
  if (!/^[\w.-]+\.zip$/.test(bundle)) {
    return null
  }
  return {
    version: record.version,
    bundle,
    ...(typeof record.sha256 === 'string' ? { sha256: record.sha256 } : {}),
  }
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

const downloadBundle = async (
  info: VersionInfo,
  signal: AbortSignal
): Promise<Uint8Array | null> => {
  const base = __UPDATE_BASE_URL__.replace(/\/$/, '')
  const response = await fetch(`${base}/${info.bundle}`, {
    cache: 'no-store',
    signal: withTimeout(signal, DOWNLOAD_TIMEOUT_MS),
  })
  if (!response.ok) {
    return null
  }
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_ZIP_BYTES) {
    return null
  }
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength > MAX_ZIP_BYTES) {
    return null
  }
  // 校验 zip 本地文件头，避免把错误页面当更新包写入
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return null
  }
  if (info.sha256) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const hash = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    if (hash !== info.sha256.toLowerCase()) {
      return null
    }
  }
  return buffer
}

/**
 * 在原生端启动时调用。检查、下载、安装全程不阻塞界面，失败只记录到控制台。
 * 安装成功只落盘，不立即重载；下次启动时原生插件自动切换到新版本目录。
 */
export const checkForUpdate = (signal: AbortSignal): void => {
  if (!Capacitor.isNativePlatform() || !__UPDATE_BASE_URL__) {
    return
  }
  void (async () => {
    try {
      const before = await HotUpdate.getVersion()
      const info = await readVersion(signal)
      if (!info) {
        return
      }
      const current = before.version === 'builtin' ? __APP_VERSION__ : before.version
      if (compareVersions(info.version, current) <= 0) {
        return
      }
      const bundle = await downloadBundle(info, signal)
      if (!bundle) {
        return
      }
      await HotUpdate.install({ zipBase64: bytesToBase64(bundle), version: info.version })
      showToast({ key: 'updateDownloaded' })
    } catch {
      // 离线、超时或插件未就绪时保持内置版本，不影响正常使用
    }
  })()
}
