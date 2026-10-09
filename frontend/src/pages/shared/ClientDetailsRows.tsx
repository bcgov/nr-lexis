import type { ReactNode } from 'react'
import type { ApplicationClientData } from '@/service/application-client-lookup-service'
import { RecordField, RecordFieldGroup, RecordFieldRow } from './RecordFieldGrid'

type ClientField = {
  label: ReactNode
  value?: ReactNode
  edit?: ReactNode | (() => ReactNode)
}

type ClientDetailsRowsProps = {
  client: ClientField
  location: ClientField
  clientData: ApplicationClientData | null
  isLoading?: boolean
  /**
   * The address and contact rows appear once a client location is chosen, while its details load
   * and once they have loaded.
   */
  showDetails: boolean
}

/**
 * A client's rows on the field grid: Client and Client location, then the address and contact
 * rows, which update together and are announced when they appear.
 */
export function ClientDetailsRows({
  client,
  location,
  clientData,
  isLoading = false,
  showDetails,
}: ClientDetailsRowsProps) {
  const detail = (value: string | undefined) => (isLoading ? 'Loading…' : value)
  const hidden = !showDetails || (!isLoading && !clientData)
  return (
    <>
      <RecordFieldRow>
        <RecordField span="wide" {...client} />
        <RecordField span="wide" {...location} />
      </RecordFieldRow>
      <RecordFieldGroup aria-live="polite">
        <RecordFieldRow hidden={hidden}>
          <RecordField label="Address" span="wide" value={detail(clientData?.address)} />
          <RecordField label="City" value={detail(clientData?.city)} />
          <RecordField label="Province" value={detail(clientData?.province)} />
        </RecordFieldRow>
        <RecordFieldRow hidden={hidden}>
          <RecordField label="Country" value={detail(clientData?.country)} />
          <RecordField label="Postal code" value={detail(clientData?.postalCode)} />
        </RecordFieldRow>
        <RecordFieldRow hidden={hidden}>
          <RecordField label="Phone number" value={detail(clientData?.phone)} />
          <RecordField label="Fax number" value={detail(clientData?.fax)} />
          <RecordField label="Email address" value={detail(clientData?.email)} />
        </RecordFieldRow>
      </RecordFieldGroup>
    </>
  )
}
