import { useEffect, useMemo, useState, type FC } from 'react'
import { Column, Grid, InlineLoading, InlineNotification } from '@carbon/react'
import { useParams } from 'react-router-dom'
import type { IndianReservePermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile, DetailListTile, type DetailListItem } from '@/pages/shared/DetailSections'
import { fetchIndianReservePermitDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const IndianReservePermitDetailsPage: FC = () => {
  const { permitNumber } = useParams()
  const [detail, setDetail] = useState<IndianReservePermitDetail | null>(null)
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
        const response = await fetchIndianReservePermitDetail(permitNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No indian reserve permit found for ${permitNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve indian reserve permit detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [permitNumber])

  const packageItems = useMemo<DetailListItem[]>(() => {
    return (detail?.packages ?? []).map((item, index) => ({
      key: `package-${index}-${item}`,
      content: item,
    }))
  }, [detail?.packages])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Indian Reserve Permit Details</h1>
        <p>
          Permit <code>{permitNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading indian reserve permit detail..." />
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
              title="Permit Summary"
              fields={[
                { label: 'Permit Number', value: displayValue(detail.permitNumber) },
                { label: 'Client Number', value: displayValue(detail.clientNumber) },
                { label: 'Client Location', value: displayValue(detail.clientLocation) },
                { label: 'Region', value: displayValue(detail.region) },
                { label: 'Application Date', value: displayValue(detail.applicationDate) },
                { label: 'Permit Issue Date', value: displayValue(detail.permitIssueDate) },
                {
                  label: 'Estimated Shipping Date',
                  value: displayValue(detail.estimatedShippingDate),
                },
                {
                  label: 'Destination Country',
                  value: displayValue(detail.destinationCountry),
                },
                { label: 'Transport Type', value: displayValue(detail.transportTypeCode) },
                { label: 'Transport Name', value: displayValue(detail.transportName) },
                { label: 'Port Of Export', value: displayValue(detail.portOfExport) },
                { label: 'Other Port Of Export', value: displayValue(detail.otherPortOfExport) },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <DetailListTile
              title="Packages"
              items={packageItems}
              emptyLabel="No packages available."
            />
          </Column>
        </>
      )}
    </Grid>
  )
}

export default IndianReservePermitDetailsPage
