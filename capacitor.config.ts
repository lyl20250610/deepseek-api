import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dsmobile.chat',
  appName: 'deepseek手机api版',
  webDir: 'dist',
  backgroundColor: '#f4f7ff',
  android: {
    backgroundColor: '#f4f7ff',
    allowMixedContent: false,
  },
  plugins: {
    // Capacitor 8 内置 SystemBars：edge-to-edge 时向 documentElement 注入 --safe-area-inset-*。
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#f4f7ff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config
