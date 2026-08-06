import { useEffect, useState } from 'react'
import { Button, Select, SelectItem } from '@carbon/react'
import {
  DEFAULT_REGION_OPTIONS,
  fetchUserPreferences,
  updateUserPreferences,
  type DefaultRegion,
} from '@/service/user-preference-service'

type UserRegionPreferenceProps = {
  active: boolean
}

const LOAD_ERROR = 'Your region preference could not be loaded.'
const SAVE_ERROR = 'Your region preference could not be saved.'

const asDefaultRegion = (value: string): DefaultRegion | null =>
  DEFAULT_REGION_OPTIONS.find((option) => option.value === value)?.value ?? null

export default function UserRegionPreference({ active }: UserRegionPreferenceProps) {
  const [savedRegion, setSavedRegion] = useState<DefaultRegion | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<DefaultRegion | null>(null)
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
        setSavedRegion(preferences.defaultRegion)
        setSelectedRegion(preferences.defaultRegion)
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
      const preferences = await updateUserPreferences(selectedRegion)
      setSavedRegion(preferences.defaultRegion)
      setSelectedRegion(preferences.defaultRegion)
      setMessage('Preference saved.')
    } catch {
      setMessage(SAVE_ERROR)
      setHasError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRegionChange = (value: string): void => {
    setSelectedRegion(asDefaultRegion(value))
    setMessage('')
    setHasError(false)
  }

  return (
    <section className="profile-panel__preferences" aria-labelledby="profile-preferences-title">
      <h3 id="profile-preferences-title" className="profile-panel__preferences-title">
        Preferences
      </h3>
      <Select
        id="profile-default-region"
        labelText="Default region"
        helperText="Used to preselect related areas when available."
        value={selectedRegion ?? ''}
        disabled={isLoading || isSaving || !hasLoaded}
        onChange={(event) => handleRegionChange(event.target.value)}
      >
        <SelectItem value="" text={isLoading ? 'Loading preference...' : 'No default region'} />
        {DEFAULT_REGION_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} text={option.label} />
        ))}
      </Select>
      <div className="profile-panel__preferences-actions">
        <Button
          kind="primary"
          size="sm"
          disabled={isLoading || isSaving || !hasLoaded || selectedRegion === savedRegion}
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
