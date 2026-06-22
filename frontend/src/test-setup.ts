import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { clearAllPageDataCache } from '@/pages/shared/page-data-cache'

const server = setupServer()

const ResizeObserverMock = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class TestStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value))
  }
}

const installTestStorage = (property: 'localStorage' | 'sessionStorage'): void => {
  const storage = new TestStorage()
  Object.defineProperty(globalThis, property, {
    configurable: true,
    value: storage,
  })

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, property, {
      configurable: true,
      value: storage,
    })
  }
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  })
}

installTestStorage('localStorage')
installTestStorage('sessionStorage')

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

//  Close server after all tests
afterAll(() => server.close())

// Reset handlers after each test `important for test isolation`
afterEach(() => {
  server.resetHandlers()
  clearAllPageDataCache()
})
