import { useEffect, useState } from 'react'
import { Column, Grid, InlineLoading } from '@carbon/react'
import { useParams } from 'react-router-dom'
import { AppNotification } from '../../components/AppNotification'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialOfferDetail } from '@/service/lexis-detail-service'

const ProvincialOfferDetailsPage = () => {
  const { offerNumber } = useParams()
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const beginDetailRequest = useLatestRequestGuard()

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      if (!offerNumber) {
        setErrorMessage('Offer number is missing from the route.')
        setDetail(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setDetail(null)
      setErrorMessage('')
      try {
        const response = await fetchProvincialOfferDetail(offerNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial offer found for ${offerNumber}.`)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial offer detail.')
          setDetail(null)
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [offerNumber, beginDetailRequest])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial offer details</h1>
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
          <AppNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Offer summary"
              fields={[
                { label: 'Offer number', value: displayValue(detail.offerNumber) },
                { label: 'Application number', value: displayValue(detail.applicationNumber) },
                { label: 'Package number', value: displayValue(detail.packageNumber) },
                { label: 'Company name', value: displayValue(detail.companyName) },
                { label: 'Contact name', value: displayValue(detail.contactName) },
                {
                  label: 'Offer amount',
                  value:
                    detail.purchaseOfferAmount === null
                      ? 'Not provided'
                      : `$${detail.purchaseOfferAmount.toLocaleString()}`,
                },
                { label: 'Offer date', value: displayValue(detail.purchaseOfferDate) },
                { label: 'Withdrawal date', value: displayValue(detail.offerWithdrawalDate) },
                {
                  label: 'Timber Export Advisory Committee review date',
                  value: displayValue(detail.teacReviewDate),
                },
                { label: 'Approval indicator', value: displayValue(detail.approvalIndicator) },
                { label: 'Valid offer', value: displayValue(detail.validOfferIndicator) },
                { label: 'Fair offer', value: displayValue(detail.fairOfferIndicator) },
                { label: 'Offer remark', value: displayValue(detail.offerRemark) },
                { label: 'Withdraw reason', value: displayValue(detail.withdrawReason) },
                {
                  label: 'Export jurisdiction',
                  value: displayValue(detail.exportJurisdictionCode),
                },
                {
                  label: 'Manufacturing facility',
                  value: displayValue(detail.manufacturingFacilityInfo),
                },
                {
                  label: 'Offering client number',
                  value: displayValue(detail.offeringClientNumber),
                },
                { label: 'Pickup location', value: displayValue(detail.pickupLocation) },
                { label: 'Offer condition', value: displayValue(detail.offerCondition) },
                { label: 'Advertising date', value: displayValue(detail.advertisingDate) },
                { label: 'Offer end date', value: displayValue(detail.offerEndDate) },
                { label: 'Offer volume (m³)', value: displayValue(detail.offerVolume) },
                { label: 'Region', value: displayValue(detail.region) },
              ]}
            />
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialOfferDetailsPage
