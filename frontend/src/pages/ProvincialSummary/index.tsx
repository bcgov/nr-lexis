import { useCallback, useEffect, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react'
import { searchApplicationReviews } from '@/service/application-review-search-service'
import { searchFederalApplications } from '@/service/federal-application-search-service'
import { searchIndianReservePermits } from '@/service/indian-reserve-permit-search-service'
import { searchProvincialApplications } from '@/service/provincial-application-search-service'
import { searchProvincialExemptions } from '@/service/provincial-exemption-search-service'
import { searchProvincialOffers } from '@/service/provincial-offer-search-service'
import { searchProvincialPermits } from '@/service/provincial-permit-search-service'

type SummaryMetric = {
  key: string
  label: string
  description: string
  total: number
}

const INITIAL_METRICS: SummaryMetric[] = [
  {
    key: 'provincialApplications',
    label: 'Provincial Applications',
    description: 'Total matched by current base search defaults.',
    total: 0,
  },
  {
    key: 'provincialExemptions',
    label: 'Provincial Exemptions',
    description: 'Total exemption files in search scope.',
    total: 0,
  },
  {
    key: 'provincialOffers',
    label: 'Provincial Offers',
    description: 'Total purchase offers in search scope.',
    total: 0,
  },
  {
    key: 'provincialPermits',
    label: 'Provincial Permits',
    description: 'Total permit files in search scope.',
    total: 0,
  },
  {
    key: 'reviewQueue',
    label: 'Provincial Review Queue',
    description: 'Total applications in review queue.',
    total: 0,
  },
  {
    key: 'federalApplications',
    label: 'Federal Applications',
    description: 'Total federal application files in scope.',
    total: 0,
  },
  {
    key: 'indianReservePermits',
    label: 'Indian Reserve Permits',
    description: 'Total Indian reserve permit files in scope.',
    total: 0,
  },
]

const ProvincialSummaryPage: FC = () => {
  const [metrics, setMetrics] = useState<SummaryMetric[]>(INITIAL_METRICS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reviewPreview, setReviewPreview] = useState<
    { applicationNumber: string; status: string; listingDate: string; region: string }[]
  >([])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const [
        provincialApplications,
        provincialExemptions,
        provincialOffers,
        provincialPermits,
        reviewQueue,
        federalApplications,
        indianReservePermits,
      ] = await Promise.all([
        searchProvincialApplications({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            exemptionType: '',
            exemptionNumber: '',
            applicationStatus: '',
            productTypeCode: '',
            region: [],
            listingFromDate: '',
            listingToDate: '',
            applicantClientNumber: '',
            ownerClientNumber: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'applicationNumber',
          sortDirection: 'desc',
        }),
        searchProvincialExemptions({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            exemptionNumber: '',
            region: [],
            listFromDate: '',
            listToDate: '',
            exemptionTypeCode: '',
            exemptionStatusCode: '',
            applicantClientNumber: '',
            ownerClientNumber: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'exemptionNumber',
          sortDirection: 'asc',
        }),
        searchProvincialOffers({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            clientNumber: '',
            listingFromDate: '',
            listingToDate: '',
            region: [],
            withdrawalFromDate: '',
            withdrawalToDate: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'offerNumber',
          sortDirection: 'asc',
        }),
        searchProvincialPermits({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            region: [],
            issuedFromDate: '',
            issuedToDate: '',
            permitStatus: '',
            permitNumber: '',
            ownerClientNumber: '',
            applicantClientNumber: '',
          },
          page: 0,
          pageSize: 1,
          sortField: 'permitNumber',
          sortDirection: 'asc',
        }),
        searchApplicationReviews({
          filters: {
            applicationNumber: '',
            productTypeCode: '',
            region: [],
            receivedFromDate: '',
            receivedToDate: '',
            listingFromDate: '',
            listingToDate: '',
          },
          page: 0,
          pageSize: 5,
          sortField: 'applicationNumber',
          sortDirection: 'asc',
        }),
        searchFederalApplications({
          filters: {
            applicationNumber: '',
            packageNumber: '',
            applicationStatus: '',
            clientNumber: '',
            receivedFromDate: '',
            receivedToDate: '',
            listingFromDate: '',
            listingToDate: '',
          },
          page: 0,
          pageSize: 1,
        }),
        searchIndianReservePermits({
          filters: {
            permitNumber: '',
            packageNumber: '',
            fromPermitIssueDate: '',
            toPermitIssueDate: '',
            fromEstimatedShippingDate: '',
            toEstimatedShippingDate: '',
          },
          page: 0,
          pageSize: 1,
        }),
      ])

      setMetrics([
        { ...INITIAL_METRICS[0], total: provincialApplications.page.totalElements },
        { ...INITIAL_METRICS[1], total: provincialExemptions.page.totalElements },
        { ...INITIAL_METRICS[2], total: provincialOffers.page.totalElements },
        { ...INITIAL_METRICS[3], total: provincialPermits.page.totalElements },
        { ...INITIAL_METRICS[4], total: reviewQueue.page.totalElements },
        { ...INITIAL_METRICS[5], total: federalApplications.page.totalElements },
        { ...INITIAL_METRICS[6], total: indianReservePermits.page.totalElements },
      ])

      setReviewPreview(
        reviewQueue.content.map((item) => ({
          applicationNumber: item.applicationNumber,
          status: item.status,
          listingDate: item.listingDate,
          region: item.region,
        })),
      )
    } catch (error) {
      console.error(error)
      setErrorMessage('Unable to calculate provincial summary metrics.')
      setMetrics(INITIAL_METRICS)
      setReviewPreview([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Provincial Summary</h1>
        <p>Base summary dashboard powered by migrated search endpoints.</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <div className="legacy-search-actions">
          <Button kind="secondary" onClick={() => void loadSummary()} disabled={loading}>
            Refresh Summary
          </Button>
        </div>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading summary metrics..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16}>
          <InlineNotification
            kind="error"
            title="Summary Error"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading &&
        metrics.map((metric) => (
          <Column key={metric.key} sm={4} md={4} lg={5}>
            <Tile>
              <h2 className="dashboard-title">{metric.label}</h2>
              <p className="summary-metric-value">{metric.total.toLocaleString()}</p>
              <p>{metric.description}</p>
            </Tile>
          </Column>
        ))}

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Review Queue Preview</h2>
          <Table useZebraStyles>
            <TableHead>
              <TableRow>
                <TableHeader>Application</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Listing Date</TableHeader>
                <TableHeader>Region</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {reviewPreview.map((row) => (
                <TableRow key={row.applicationNumber}>
                  <TableCell>{row.applicationNumber}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.listingDate}</TableCell>
                  <TableCell>{row.region}</TableCell>
                </TableRow>
              ))}
              {reviewPreview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>No review queue data available.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default ProvincialSummaryPage
