import { Capacitor } from '@capacitor/core'

/** 只在浏览器/PWA 中注册 Service Worker；原生壳使用打包进 APK 的本地资源。 */
export const registerServiceWorker = () => {
  if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) {
    return
  }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    return
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // 注册失败不影响正常使用；下次启动会重试。
    })
  })
}
