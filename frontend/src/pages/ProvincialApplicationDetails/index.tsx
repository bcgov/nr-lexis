import { useEffect, useMemo, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile, DetailListTile, type DetailListItem } from '@/pages/shared/DetailSections'
import { fetchProvincialApplicationDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const ProvincialApplicationDetailsPage: FC = () => {
  const { applicationNumber } = useParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
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
        const response = await fetchProvincialApplicationDetail(applicationNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial application found for ${applicationNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial application detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [applicationNumber])

  const packageItems = useMemo<DetailListItem[]>(() => {
    return (detail?.packages ?? []).map((item) => ({
      key: item.packageNumber,
      content: `${item.packageNumber} - ${item.volume.toLocaleString()} m³ (${item.pieceCount} pieces)`,
    }))
  }, [detail?.packages])

  const remarkItems = useMemo<DetailListItem[]>(() => {
    return (detail?.remarks ?? []).map((item, index) => ({
      key: `${item.title}-${index}`,
      content: `${item.title}: ${item.remark}`,
    }))
  }, [detail?.remarks])

  const offerItems = useMemo<DetailListItem[]>(() => {
    return (detail?.offers ?? []).map((item) => {
      const suffix = item.withdrawalDate ? ` (withdrawn ${item.withdrawalDate})` : ''
      return {
        key: item.offerNumber,
        content: `${item.offerNumber} - ${item.validOffer ? 'Valid' : 'Invalid'}${suffix}`,
      }
    })
  }, [detail?.offers])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial Application Details</h1>
        <p>
          Application <code>{applicationNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial application detail..." />
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
              title="Application Summary"
              fields={[
                { label: 'Application Number', value: displayValue(detail.applicationNumber) },
                { label: 'Exemption Number', value: displayValue(detail.exemptionNumber) },
                {
                  label: 'Status',
                  value: displayValue(detail.statusDescription ?? detail.applicationStatusCode),
                },
                { label: 'Product Type', value: displayValue(detail.productTypeCode) },
                { label: 'Owner Client Number', value: displayValue(detail.ownerClientNumber) },
                { label: 'Agent Client Number', value: displayValue(detail.agentClientNumber) },
                {
                  label: 'Org Unit',
                  value: displayValue(detail.orgUnitName ?? detail.orgUnitNumber),
                },
                { label: 'Exemption Reason', value: displayValue(detail.exemptionReasonCode) },
                { label: 'Application Date', value: displayValue(detail.applicationDate) },
                { label: 'Received Date', value: displayValue(detail.receivedDate) },
                { label: 'Listing Date', value: displayValue(detail.listingDate) },
                { label: 'Term (days)', value: displayValue(detail.termDays) },
                {
                  label: 'Application Volume (m³)',
                  value: displayValue(detail.applicationVolume),
                },
                { label: 'Average Log Volume', value: displayValue(detail.averageLogVolume) },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Access & Workflow Flags"
              fields={[
                {
                  label: 'Can Create Offers',
                  value: (
                    <Tag type={detail.canCreateOffers ? 'green' : 'gray'}>
                      {detail.canCreateOffers ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
                {
                  label: 'Industry User',
                  value: (
                    <Tag type={detail.industryUser ? 'green' : 'gray'}>
                      {detail.industryUser ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
                {
                  label: 'Read Only',
                  value: (
                    <Tag type={detail.readOnly ? 'red' : 'gray'}>
                      {detail.readOnly ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
                {
                  label: 'Exemption Approver',
                  value: (
                    <Tag type={detail.exemptionApprover ? 'green' : 'gray'}>
                      {detail.exemptionApprover ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
                {
                  label: 'Locked',
                  value: (
                    <Tag type={detail.locked ? 'red' : 'green'}>{detail.locked ? 'Yes' : 'No'}</Tag>
                  ),
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

export default ProvincialApplicationDetailsPage
