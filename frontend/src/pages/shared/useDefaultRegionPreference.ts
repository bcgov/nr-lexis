import { useEffect, useState } from 'react'
import {
  fetchUserPreferences,
  subscribeToUserPreferences,
  type DefaultZone,
} from '@/service/user-preference-service'

export const useDefaultRegionPreference = (): {
  defaultRegion: DefaultZone | null
  preferenceLoading: boolean
} => {
  const [defaultRegion, setDefaultRegion] = useState<DefaultZone | null>(null)
  const [preferenceLoading, setPreferenceLoading] = useState(true)

  useEffect(() => {
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
        // Preference loading is optional; tables fall back to all available areas.
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
  }, [])

  return { defaultRegion, preferenceLoading }
}
