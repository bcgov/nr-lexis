import { ComboBox, Loading } from '@carbon/react'
import { use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext } from '@/context/auth/AuthContext'
import { searchForestClients, type ForestClientSuggestion } from '@/service/client-search-service'
import './ForestClientComboBox.scss'

type ForestClientComboBoxProps = {
  id: string
  labelText: ReactNode
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  onFocus?: () => void
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  invalidText?: ReactNode
  counterpartyClientNumber?: string
  selectedClientName?: string
  helperText?: ReactNode
  resetKey?: string | number
}

const clientLabel = (client: ForestClientSuggestion | string | null | undefined) => {
  if (typeof client === 'string') return client
  if (!client) return ''
  const name = [client.companyName, client.clientAcronym ? `(${client.clientAcronym})` : '']
    .filter(Boolean)
    .join(' ')
  return name ? `${name} · ${client.clientNumber}` : client.clientNumber
}

const EMPTY_SUGGESTIONS: ForestClientSuggestion[] = []

// INTENTIONAL_LEGACY_DIVERGENCE(SEARCHABLE_CLIENT_SELECTION): Offer name/number
// discovery while passing only the selected client number to search and save workflows.
export default function ForestClientComboBox(props: ForestClientComboBoxProps) {
  const auth = use(AuthContext)
  const scope = JSON.stringify([
    auth?.capabilities.principal,
    auth?.capabilities.forestClientNumber,
    auth?.capabilities.roles,
  ])
  // Remount Carbon's input when the authorization context or parent reset changes.
  return <ClientInput key={`${scope}:${props.resetKey ?? ''}`} {...props} />
}

function ClientInput({
  id,
  labelText,
  value,
  onChange,
  onBlur,
  onFocus,
  required,
  disabled,
  invalid,
  invalidText,
  counterpartyClientNumber,
  selectedClientName,
  helperText = 'Enter name or client number (min. 3 characters)',
}: ForestClientComboBoxProps) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<ForestClientSuggestion | null>(null)
  const [result, setResult] = useState<{
    key: string
    items: ForestClientSuggestion[]
    status: 'loading' | 'ready' | 'error'
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const selected = useMemo(() => {
    if (!value) return null
    return chosen?.clientNumber === value
      ? chosen
      : { clientNumber: value, companyName: selectedClientName ?? '', clientAcronym: '' }
  }, [value, chosen, selectedClientName])
  const requestKey = JSON.stringify([query, value, disabled, counterpartyClientNumber, retry])
  const items = result?.key === requestKey ? result.items : EMPTY_SUGGESTIONS
  const status = result?.key === requestKey ? result.status : 'idle'

  useEffect(() => {
    let active = true
    const term = query.trim()
    if (disabled || value || term.length < 3) return
    const timer = setTimeout(() => {
      setResult({ key: requestKey, items: [], status: 'loading' })
      void searchForestClients(term, counterpartyClientNumber)
        .then((results) => {
          if (!active) return
          setResult({ key: requestKey, items: results, status: 'ready' })
        })
        .catch(() => {
          if (active) setResult({ key: requestKey, items: [], status: 'error' })
        })
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, value, disabled, counterpartyClientNumber, retry, requestKey])

  return (
    <div className="forest-client-combobox">
      <ComboBox<ForestClientSuggestion | string>
        id={id}
        autoAlign
        titleText={
          <span className="forest-client-combobox__label">
            {labelText}
            {status === 'loading' && (
              <span aria-hidden="true">
                <Loading
                  small
                  withOverlay={false}
                  description="Searching clients"
                  className="forest-client-combobox__spinner"
                />
              </span>
            )}
          </span>
        }
        helperText={helperText}
        items={items}
        itemToString={clientLabel}
        shouldFilterItem={() => true}
        inputProps={{
          maxLength: 60,
          'aria-busy': status === 'loading',
          // Enter selects a suggestion; it must not also submit the surrounding form.
          onKeyDownCapture: (event) => {
            if (event.key === 'Enter') event.preventDefault()
          },
        }}
        selectedItem={selected ?? (query || null)}
        allowCustomValue
        onInputChange={(text) => {
          if (selected && text === clientLabel(selected)) return
          setQuery(text)
          if (value) onChange('')
        }}
        aria-required={required || undefined}
        disabled={disabled}
        invalid={invalid}
        invalidText={invalidText}
        onBlur={onBlur}
        onFocus={onFocus}
        onChange={({ selectedItem }) => {
          // Search text is controlled separately from a verified client selection.
          // Carbon must retain that text when editing clears the previous client.
          if (typeof selectedItem === 'string' || selectedItem === undefined) return
          setChosen(selectedItem ?? null)
          setQuery('')
          const next = selectedItem?.clientNumber ?? ''
          if (next !== value) onChange(next)
        }}
      />
      <div
        className="forest-client-combobox__status"
        id={`${id}-search-status`}
        role="status"
        aria-live="polite"
      >
        {status === 'loading' && 'Searching clients…'}
        {status === 'ready' && items.length === 0 && 'No matching clients.'}
        {status === 'error' && (
          <>
            Unable to search clients.{' '}
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setRetry((count) => count + 1)}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  )
}
