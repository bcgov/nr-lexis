import { useCallback, useEffect, useState, type FC } from 'react'
import { Button, Column, Grid, InlineLoading, InlineNotification, Tile } from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialOfferDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialOfferDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const ProvincialOfferDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { offerNumber } = useParams()
  const [searchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialOfferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const beginDetailRequest = useLatestRequestGuard()
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )

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
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canPerform('/offersSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/offers'))}
                >
                  Back to Offer Search Results
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={
                    !detail.applicationNumber ||
                    !canPerform('/applicationSearch') ||
                    !canPerform('/applicationDetails')
                  }
                  onClick={() => {
                    if (detail.applicationNumber) {
                      navigate(
                        withCurrentSearch(`/provincial/application/${detail.applicationNumber}`),
                      )
                    }
                  }}
                >
                  Open Application Detail
                </Button>
              </div>
            </Tile>
          </Column>
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
                {
                  label: 'Offering Client Number',
                  value: displayValue(detail.offeringClientNumber),
                },
                { label: 'Pickup Location', value: displayValue(detail.pickupLocation) },
                { label: 'Offer Condition', value: displayValue(detail.offerCondition) },
                { label: 'Advertising Date', value: displayValue(detail.advertisingDate) },
                { label: 'Offer End Date', value: displayValue(detail.offerEndDate) },
                { label: 'Offer Volume (m³)', value: displayValue(detail.offerVolume) },
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
