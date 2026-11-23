import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { closeTopModal } from '../components/base/Modal.js'
import { useSearchPanel, closeSearchPanel } from '../components/search/searchPanelState.js'
import { closeSettings, useSettingsDialog } from '../components/settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'

const isNative = () => Capacitor.isNativePlatform()

/** 系统栏文字颜色跟随网页主题；背景色在 Android 15+ 由 edge-to-edge 接管。 */
const syncStatusBar = () => {
  if (!isNative()) {
    return
  }
  const dark = document.body.classList.contains('dark')
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  const background = getComputedStyle(document.body).backgroundColor
  if (background && background !== 'rgba(0, 0, 0, 0)') {
    void StatusBar.setBackgroundColor({ color: background }).catch(() => {})
  }
}

const installBackButton = () => {
  void NativeApp.addListener('backButton', () => {
    // 按打开层级逐层关闭：弹窗 > 设置 > 会话抽屉 > 搜索面板；根页面退到后台，避免误杀进程。
    if (closeTopModal()) {
      return
    }
    if (useSettingsDialog.getState().open) {
      closeSettings()
      return
    }
    if (useMobileSider.getState().open) {
      closeMobileSider()
      return
    }
    if (useSearchPanel.getState().entry) {
      closeSearchPanel()
      return
    }
    void NativeApp.minimizeApp()
  })
}

const hideSplash = () => {
  // 等首屏和字体就绪再淡出，避免启动图消失后出现一瞬间的空白。
  const ready = document.fonts?.ready ?? Promise.resolve()
  void ready
    .then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    .then(() => SplashScreen.hide({ fadeOutDuration: 220 }))
    .catch(() => {})
}

let started = false

/** 原生壳初始化：状态栏、返回键、启动图。浏览器/PWA 下全部跳过。 */
export const initNativeShell = () => {
  if (started || !isNative()) {
    return
  }
  started = true

  syncStatusBar()
  new MutationObserver(syncStatusBar).observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-ds-dark-theme'],
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncStatusBar()
    }
  })
  installBackButton()
  hideSplash()
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read blob failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })

/**
 * 原生端把二进制文件写入缓存目录并调起系统分享面板；浏览器端返回 false，
 * 由调用方继续使用 <a download>。
 */
export const shareFile = async (blob: Blob, name: string): Promise<boolean> => {
  if (!isNative()) {
    return false
  }
  const data = await blobToBase64(blob)
  const { uri } = await Filesystem.writeFile({
    path: name,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  await Share.share({ title: name, text: name, url: uri, dialogTitle: name })
  return true
}
