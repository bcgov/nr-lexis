import { Dropdown } from '@carbon/react'

export type PermitPackageOption = { value: string; label: string }

type PermitPackageSelectorProps = {
  id: string
  options: PermitPackageOption[]
  value: string
  disabled?: boolean
  /** With one package, show its number as text. Otherwise a single package shows nothing. */
  showSinglePackage?: boolean
  onChange: (packageNumber: string) => void
}

/**
 * Chooses the package a permit tab shows. Two or more packages get a Dropdown that always has a
 * package selected; one package needs no choice.
 */
const PermitPackageSelector = ({
  id,
  options,
  value,
  disabled = false,
  showSinglePackage = false,
  onChange,
}: PermitPackageSelectorProps) => {
  if (options.length === 0) return null

  if (options.length === 1) {
    return showSinglePackage ? (
      <dl className="detail-field-grid permit-package-selector">
        <div className="detail-field-item">
          <dt className="detail-field-label">Package number</dt>
          <dd className="detail-field-value">{options[0].label}</dd>
        </div>
      </dl>
    ) : null
  }

  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  return (
    <div className="permit-package-selector">
      <Dropdown<PermitPackageOption>
        id={id}
        titleText="Package number"
        label="Package number"
        items={options}
        itemToString={(option) => option?.label ?? ''}
        selectedItem={selectedOption}
        disabled={disabled}
        onChange={({ selectedItem }) => {
          if (selectedItem) onChange(selectedItem.value)
        }}
      />
    </div>
  )
}

export default PermitPackageSelector
