import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devHost = env.VITE_DEV_HOST ?? 'localhost'
  const devPort = Number(env.VITE_DEV_PORT ?? 3000)
  const backendTarget = env.VITE_DEV_BACKEND_TARGET ?? 'http://localhost:8080'
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : devPort
  const hmrHost = env.VITE_HMR_HOST ?? devHost
  const hmrProtocol = (env.VITE_HMR_PROTOCOL ?? 'ws') === 'wss' ? 'wss' : 'ws'

  return {
    plugins: [react()],
    server: {
      host: devHost,
      port: devPort,
      fs: {
        allow: ['..'],
      },
      hmr: {
        overlay: false,
        protocol: hmrProtocol,
        host: hmrHost,
        port: hmrPort,
      },
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: devHost,
      port: devPort,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx'],
    },
    build: {
      target: 'esnext',
      rollupOptions: {},
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['color-functions', 'global-builtin', 'import'],
        },
      },
    },
  }
})
