import { useEffect, useMemo, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification, Tag } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile, DetailListTile, type DetailListItem } from '@/pages/shared/DetailSections'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const ProvincialExemptionDetailsPage: FC = () => {
  const { exemptionNumber } = useParams()
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!exemptionNumber) {
        setErrorMessage('Exemption number is missing from the route.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')

      try {
        const response = await fetchProvincialExemptionDetail(exemptionNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial exemption found for ${exemptionNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial exemption detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [exemptionNumber])

  const permitItems = useMemo<DetailListItem[]>(() => {
    return (detail?.permitNumbers ?? []).map((permitNumber) => ({
      key: permitNumber,
      content: permitNumber,
    }))
  }, [detail?.permitNumbers])

  const remarkItems = useMemo<DetailListItem[]>(() => {
    return (detail?.remarks ?? []).map((item, index) => ({
      key: `${item.title}-${index}`,
      content: `${item.title}: ${item.remark}`,
    }))
  }, [detail?.remarks])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial Exemption Details</h1>
        <p>
          Exemption <code>{exemptionNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial exemption detail..." />
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
              title="Exemption Summary"
              fields={[
                { label: 'Exemption Number', value: displayValue(detail.exemptionNumber) },
                {
                  label: 'Type',
                  value: displayValue(detail.exemptionTypeDescription ?? detail.exemptionTypeCode),
                },
                {
                  label: 'Status',
                  value: displayValue(
                    detail.exemptionStatusDescription ?? detail.exemptionStatusCode,
                  ),
                },
                { label: 'Application Number', value: displayValue(detail.applicationNumber) },
                { label: 'Application Status', value: displayValue(detail.applicationStatus) },
                { label: 'Owner Client Number', value: displayValue(detail.ownerClientNumber) },
                { label: 'Agent Client Number', value: displayValue(detail.agentClientNumber) },
                { label: 'Approval Date', value: displayValue(detail.approvalDate) },
                { label: 'Expiry Date', value: displayValue(detail.expiryDate) },
                {
                  label: 'Approved Volume (m³)',
                  value: displayValue(detail.approvedVolume),
                },
                { label: 'Used Volume (m³)', value: displayValue(detail.usedVolume) },
                {
                  label: 'Remaining Volume (m³)',
                  value: displayValue(detail.remainingVolume),
                },
                {
                  label: 'Blanket OIC',
                  value: (
                    <Tag type={detail.blanketOic ? 'green' : 'gray'}>
                      {detail.blanketOic ? 'Yes' : 'No'}
                    </Tag>
                  ),
                },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Other Conditions"
              fields={[{ label: 'Conditions', value: displayValue(detail.otherConditions) }]}
            />
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailListTile
              title="Related Permits"
              items={permitItems}
              emptyLabel="No related permits available."
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
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

export default ProvincialExemptionDetailsPage
