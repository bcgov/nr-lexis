import { useEffect, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchProvincialOfferDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const ProvincialOfferDetailsPage: FC = () => {
  const { offerNumber } = useParams()
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!offerNumber) {
        setErrorMessage('Offer number is missing from the route.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await fetchProvincialOfferDetail(offerNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial offer found for ${offerNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial offer detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [offerNumber])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial Offer Details</h1>
        <p>
          Offer <code>{offerNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial offer detail..." />
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
            title="Offer Summary"
            fields={[
              { label: 'Offer Number', value: displayValue(detail.offerNumber) },
              { label: 'Application Number', value: displayValue(detail.applicationNumber) },
              { label: 'Package Number', value: displayValue(detail.packageNumber) },
              { label: 'Company Name', value: displayValue(detail.companyName) },
              { label: 'Contact Name', value: displayValue(detail.contactName) },
              {
                label: 'Offer Amount',
                value:
                  detail.purchaseOfferAmount === null
                    ? 'Not provided'
                    : `$${detail.purchaseOfferAmount.toLocaleString()}`,
              },
              { label: 'Offer Date', value: displayValue(detail.purchaseOfferDate) },
              { label: 'Withdrawal Date', value: displayValue(detail.offerWithdrawalDate) },
              { label: 'TEAC Review Date', value: displayValue(detail.teacReviewDate) },
              { label: 'Approval Indicator', value: displayValue(detail.approvalIndicator) },
              { label: 'Valid Offer', value: displayValue(detail.validOfferIndicator) },
              { label: 'Fair Offer', value: displayValue(detail.fairOfferIndicator) },
              { label: 'Offer Remark', value: displayValue(detail.offerRemark) },
              { label: 'Withdraw Reason', value: displayValue(detail.withdrawReason) },
              {
                label: 'Export Jurisdiction',
                value: displayValue(detail.exportJurisdictionCode),
              },
              {
                label: 'Manufacturing Facility',
                value: displayValue(detail.manufacturingFacilityInfo),
              },
              { label: 'Offering Client Number', value: displayValue(detail.offeringClientNumber) },
              { label: 'Pickup Location', value: displayValue(detail.pickupLocation) },
              { label: 'Offer Condition', value: displayValue(detail.offerCondition) },
              { label: 'Advertising Date', value: displayValue(detail.advertisingDate) },
              { label: 'Offer End Date', value: displayValue(detail.offerEndDate) },
              { label: 'Offer Volume (m³)', value: displayValue(detail.offerVolume) },
              { label: 'Region', value: displayValue(detail.region) },
            ]}
          />
        </Column>
      )}
    </Grid>
  )
}

export default ProvincialOfferDetailsPage
