import { useEffect, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const ProvincialPermitDetailsPage: FC = () => {
  const { permitNumber } = useParams()
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!permitNumber) {
        setErrorMessage('Permit number is missing from the route.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await fetchProvincialPermitDetail(permitNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial permit detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [permitNumber])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial Permit Details</h1>
        <p>
          Permit <code>{permitNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial permit detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind={detail ? 'warning' : 'error'}
            title={detail ? 'Using fallback detail' : 'Detail unavailable'}
            subtitle={errorMessage}
            lowContrast
          />
        </Column>
      )}

      {!loading && detail && (
        <Column sm={4} md={8} lg={16}>
          <DetailFieldTile
            title="Permit Summary"
            fields={[
              { label: 'Permit Number', value: displayValue(detail.permitNumber) },
              { label: 'Application Number', value: displayValue(detail.applicationNumber) },
              { label: 'Package Number', value: displayValue(detail.packageNumber) },
              { label: 'Exemption Number', value: displayValue(detail.exemptionNumber) },
              {
                label: 'Status',
                value: displayValue(detail.permitStatusDescription ?? detail.permitStatusCode),
              },
              {
                label: 'Applicant Client Number',
                value: displayValue(detail.applicantClientNumber),
              },
              { label: 'Owner Client Number', value: displayValue(detail.ownerClientNumber) },
              {
                label: 'Destination Company',
                value: displayValue(detail.destinationCompanyName),
              },
              {
                label: 'Destination Country',
                value: displayValue(detail.destinationCountryCode),
              },
              { label: 'Transport Type', value: displayValue(detail.transportTypeCode) },
              { label: 'Transport Name', value: displayValue(detail.transportName) },
              { label: 'Port Of Export', value: displayValue(detail.portOfExportCode) },
              { label: 'Other Port Of Export', value: displayValue(detail.otherPortOfExport) },
              { label: 'Issue Date', value: displayValue(detail.issueDate) },
              { label: 'Expiry Date', value: displayValue(detail.expiryDate) },
              { label: 'Received Date', value: displayValue(detail.receivedDate) },
              {
                label: 'Estimated Shipping Date',
                value: displayValue(detail.estimatedShippingDate),
              },
              { label: 'Permit Volume (m³)', value: displayValue(detail.permitVolume) },
              { label: 'Number Of Pieces', value: displayValue(detail.numberOfPieces) },
              { label: 'Receipt Number', value: displayValue(detail.receiptNumber) },
              { label: 'Federal Permit Number', value: displayValue(detail.federalPermitNumber) },
              { label: 'Invoice Number', value: displayValue(detail.invoiceNumber) },
              { label: 'Remarks', value: displayValue(detail.remarks) },
              { label: 'Region', value: displayValue(detail.region) },
            ]}
          />
        </Column>
      )}
    </Grid>
  )
}

export default ProvincialPermitDetailsPage
