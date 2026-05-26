import { useEffect, useMemo, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile, DetailListTile, type DetailListItem } from '@/pages/shared/DetailSections'
import { fetchFederalApplicationDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const FederalApplicationDetailsPage: FC = () => {
  const { applicationNumber } = useParams()
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      try {
        const response = await fetchFederalApplicationDetail(applicationNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No federal application found for ${applicationNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve federal application detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [applicationNumber])

  const packageItems = useMemo<DetailListItem[]>(() => {
    return (detail?.packages ?? []).map((item, index) => ({
      key: `package-${index}-${item}`,
      content: item,
    }))
  }, [detail?.packages])

  const remarkItems = useMemo<DetailListItem[]>(() => {
    return (detail?.remarks ?? []).map((item, index) => ({
      key: `remark-${index}-${item}`,
      content: item,
    }))
  }, [detail?.remarks])

  const offerItems = useMemo<DetailListItem[]>(() => {
    return (detail?.offers ?? []).map((item, index) => ({
      key: `offer-${index}-${item}`,
      content: item,
    }))
  }, [detail?.offers])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Federal Application Details</h1>
        <p>
          Federal application <code>{applicationNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading federal application detail..." />
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
        <>
          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Federal Application Summary"
              fields={[
                { label: 'Application Number', value: displayValue(detail.applicationNumber) },
                {
                  label: 'Federal Application Number',
                  value: displayValue(detail.federalApplicationNumber),
                },
                {
                  label: 'Status',
                  value: displayValue(detail.statusDescription ?? detail.statusCode),
                },
                { label: 'Owner Client Number', value: displayValue(detail.ownerClientNumber) },
                {
                  label: 'Owner Location Code',
                  value: displayValue(detail.ownerClientLocationCode),
                },
                { label: 'Agent Client Number', value: displayValue(detail.agentClientNumber) },
                {
                  label: 'Agent Location Code',
                  value: displayValue(detail.agentClientLocationCode),
                },
                { label: 'Exemption Number', value: displayValue(detail.exemptionNumber) },
                { label: 'Exemption Type', value: displayValue(detail.exemptionType) },
                { label: 'Exemption Reason', value: displayValue(detail.exemptionReason) },
                { label: 'Received Date', value: displayValue(detail.receivedDate) },
                { label: 'Listing Date', value: displayValue(detail.listingDate) },
                {
                  label: 'Read Only',
                  value: (
                    <Tag type={detail.readOnly ? 'red' : 'gray'}>
                      {detail.readOnly ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Federal Permit"
              fields={[
                {
                  label: 'Permit Number',
                  value: displayValue(detail.federalPermit?.permitNumber),
                },
                {
                  label: 'Permit Issue Date',
                  value: displayValue(detail.federalPermit?.permitIssueDate),
                },
                {
                  label: 'Destination Country',
                  value: displayValue(detail.federalPermit?.destinationCountry),
                },
                {
                  label: 'Transport Type',
                  value: displayValue(detail.federalPermit?.transportType),
                },
                {
                  label: 'Transport Name',
                  value: displayValue(detail.federalPermit?.transportName),
                },
                {
                  label: 'Shipping Date',
                  value: displayValue(detail.federalPermit?.shippingDate),
                },
                {
                  label: 'Port Of Export',
                  value: displayValue(detail.federalPermit?.portOfExport),
                },
                {
                  label: 'Other Port Of Export',
                  value: displayValue(detail.federalPermit?.otherPortOfExport),
                },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailListTile
              title="Packages"
              items={packageItems}
              emptyLabel="No packages available."
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
            <DetailListTile title="Offers" items={offerItems} emptyLabel="No offers available." />
          </Column>
          <Column sm={4} md={8} lg={16}>
            <DetailListTile
              title="Remarks"
              items={remarkItems}
              emptyLabel="No remarks available."
            />
          </Column>
        </>
      )}
    </Grid>
  )
}

export default FederalApplicationDetailsPage
