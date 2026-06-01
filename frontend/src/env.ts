declare global {
  interface Window {
    config: Record<string, string>
  }
}

const readEnvValue = (key: string): string | undefined => {
  const runtimeValue = window.config?.[key]
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) {
    return runtimeValue
  }

  const buildValue = (import.meta.env as Record<string, unknown>)[key]
  if (typeof buildValue === 'string' && buildValue.length > 0) {
    return buildValue
  }

  return undefined
}

// Runtime values from /config.js override build-time Vite env values.
// Values are resolved lazily so tests using vi.stubEnv can override at runtime.
export const env = new Proxy<Record<string, string | undefined>>({} as Record<string, string>, {
  get: (_, property: string | symbol) => {
    if (typeof property !== 'string') {
      return undefined
    }
    return readEnvValue(property)
  },
})
