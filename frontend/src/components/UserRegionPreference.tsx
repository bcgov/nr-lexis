import { useEffect, useState } from 'react'
import { Button, Select, SelectItem } from '@carbon/react'
import { resetPersistedRegionSearchState } from '@/pages/shared/usePersistedSearchParams'
import {
  DEFAULT_ZONE_HELPER_TEXT,
  DEFAULT_ZONE_OPTIONS,
  fetchUserPreferences,
  updateUserPreferences,
  type DefaultZone,
} from '@/service/user-preference-service'

type UserRegionPreferenceProps = {
  active: boolean
}

const LOAD_ERROR = 'Your default zone could not be loaded.'
const SAVE_ERROR = 'Your default zone could not be saved.'
const ALL_REGIONS_HELPER = 'Preselects all Natural Resource Regions in search tables.'

const asDefaultZone = (value: string): DefaultZone | null =>
  DEFAULT_ZONE_OPTIONS.find((option) => option.value === value)?.value ?? null

export default function UserRegionPreference({ active }: UserRegionPreferenceProps) {
  const [savedZone, setSavedZone] = useState<DefaultZone | null>(null)
  const [selectedZone, setSelectedZone] = useState<DefaultZone | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!active || hasLoaded) {
      return undefined
    }

    let ignoreResult = false
    setIsLoading(true)
    setMessage('')
    setHasError(false)

    void fetchUserPreferences()
      .then((preferences) => {
        if (ignoreResult) {
          return
        }
        setSavedZone(preferences.defaultRegion)
        setSelectedZone(preferences.defaultRegion)
        setHasLoaded(true)
      })
      .catch(() => {
        if (!ignoreResult) {
          setMessage(LOAD_ERROR)
          setHasError(true)
        }
      })
      .finally(() => {
        if (!ignoreResult) {
          setIsLoading(false)
        }
      })

    return () => {
      ignoreResult = true
    }
  }, [active, hasLoaded])

  const savePreference = async (): Promise<void> => {
    setIsSaving(true)
    setMessage('')
    setHasError(false)
    try {
      const preferences = await updateUserPreferences(selectedZone)
      resetPersistedRegionSearchState()
      setSavedZone(preferences.defaultRegion)
      setSelectedZone(preferences.defaultRegion)
      setMessage('Preference saved.')
    } catch {
      setMessage(SAVE_ERROR)
      setHasError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const handleZoneChange = (value: string): void => {
    setSelectedZone(asDefaultZone(value))
    setMessage('')
    setHasError(false)
  }

  return (
    <section className="profile-panel__preferences" aria-labelledby="profile-preferences-title">
      <h3 id="profile-preferences-title" className="profile-panel__preferences-title">
        Preferences
      </h3>
      <Select
        id="profile-default-zone"
        labelText="Default zone"
        helperText={selectedZone ? DEFAULT_ZONE_HELPER_TEXT[selectedZone] : ALL_REGIONS_HELPER}
        value={selectedZone ?? ''}
        disabled={isLoading || isSaving || !hasLoaded}
        onChange={(event) => handleZoneChange(event.target.value)}
      >
        <SelectItem value="" text={isLoading ? 'Loading preference...' : 'No default zone'} />
        {DEFAULT_ZONE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} text={option.label} />
        ))}
      </Select>
      <div className="profile-panel__preferences-actions">
        <Button
          kind="primary"
          size="sm"
          disabled={isLoading || isSaving || !hasLoaded || selectedZone === savedZone}
          onClick={() => void savePreference()}
        >
          {isSaving ? 'Saving...' : 'Save preference'}
        </Button>
        <p
          className={`profile-panel__preferences-status${hasError ? ' is-error' : ''}`}
          role={hasError ? 'alert' : 'status'}
        >
          {message}
        </p>
      </div>
    </section>
  )
}
