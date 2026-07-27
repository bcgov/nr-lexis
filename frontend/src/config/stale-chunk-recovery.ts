const STALE_CHUNK_RELOAD_KEY = 'lexis:stale-chunk-reload-at'
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 60_000

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>

export const recoverFromStaleChunk = (
  event: Event,
  storage: ReloadStorage,
  reload: () => void,
  now = Date.now(),
): boolean => {
  try {
    const previousAttempt = Number.parseInt(storage.getItem(STALE_CHUNK_RELOAD_KEY) ?? '', 10)
    const attemptedRecently =
      Number.isFinite(previousAttempt) &&
      now >= previousAttempt &&
      now - previousAttempt < STALE_CHUNK_RELOAD_COOLDOWN_MS

    if (attemptedRecently) {
      return false
    }

    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now))
  } catch {
    return false
  }

  event.preventDefault()
  reload()
  return true
}

export const registerStaleChunkRecovery = (): void => {
  window.addEventListener('vite:preloadError', (event) => {
    recoverFromStaleChunk(event, window.sessionStorage, () => window.location.reload())
  })
}
