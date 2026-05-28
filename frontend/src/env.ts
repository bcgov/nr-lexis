declare global {
  interface Window {
    config: Record<string, string>
  }
}

// Runtime values from /config.js override build-time Vite env values.
export const env: Record<string, string> = { ...import.meta.env, ...window.config }
