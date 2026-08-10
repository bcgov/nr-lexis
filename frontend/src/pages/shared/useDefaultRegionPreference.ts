import { useEffect, useState } from 'react'
import {
  fetchUserPreferences,
  subscribeToUserPreferences,
  type DefaultZone,
} from '@/service/user-preference-service'

export const useDefaultRegionPreference = (
  enabled = true,
): {
  defaultRegion: DefaultZone | null
  preferenceLoading: boolean
} => {
  const [defaultRegion, setDefaultRegion] = useState<DefaultZone | null>(null)
  const [preferenceLoading, setPreferenceLoading] = useState(true)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    let ignoreResult = false
    let receivedSavedPreference = false
    const unsubscribe = subscribeToUserPreferences((preferences) => {
      receivedSavedPreference = true
      setDefaultRegion(preferences.defaultRegion)
      setPreferenceLoading(false)
    })

    void fetchUserPreferences()
      .then((preferences) => {
        if (!ignoreResult && !receivedSavedPreference) {
          setDefaultRegion(preferences.defaultRegion)
        }
      })
      .catch(() => {
        // Preference loading is optional; searches remain unfiltered when it is unavailable.
      })
      .finally(() => {
        if (!ignoreResult) {
          setPreferenceLoading(false)
        }
      })

    return () => {
      ignoreResult = true
      unsubscribe()
    }
  }, [enabled])

  return enabled
    ? { defaultRegion, preferenceLoading }
    : { defaultRegion: null, preferenceLoading: false }
}
