import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
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
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchProvincialApplicationDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const ProvincialApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [packageFilter, setPackageFilter] = useState(searchParams.get('packageFilter') ?? '')
  const [offerFilter, setOfferFilter] = useState(searchParams.get('offerFilter') ?? '')
  const [remarkFilter, setRemarkFilter] = useState(searchParams.get('remarkFilter') ?? '')
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )

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

  useEffect(() => {
    const packageFilterParam = searchParams.get('packageFilter') ?? ''
    const offerFilterParam = searchParams.get('offerFilter') ?? ''
    const remarkFilterParam = searchParams.get('remarkFilter') ?? ''

    setPackageFilter((current) => (current === packageFilterParam ? current : packageFilterParam))
    setOfferFilter((current) => (current === offerFilterParam ? current : offerFilterParam))
    setRemarkFilter((current) => (current === remarkFilterParam ? current : remarkFilterParam))
  }, [searchParams])

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParams)

    if (packageFilter.trim().length > 0) {
      nextSearchParams.set('packageFilter', packageFilter)
    } else {
      nextSearchParams.delete('packageFilter')
    }

    if (offerFilter.trim().length > 0) {
      nextSearchParams.set('offerFilter', offerFilter)
    } else {
      nextSearchParams.delete('offerFilter')
    }

    if (remarkFilter.trim().length > 0) {
      nextSearchParams.set('remarkFilter', remarkFilter)
    } else {
      nextSearchParams.delete('remarkFilter')
    }

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true })
    }
  }, [offerFilter, packageFilter, remarkFilter, searchParams, setSearchParams])

  const filteredPackages = useMemo(() => {
    const rows = detail?.packages ?? []
    if (!packageFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(packageFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.packageNumber} ${item.volume.toLocaleString()} ${item.pieceCount.toLocaleString()}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.packages, packageFilter])

  const filteredOffers = useMemo(() => {
    const rows = detail?.offers ?? []
    if (!offerFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(offerFilter)
    return rows.filter((item) =>
      normalizeText(
        `${item.offerNumber} ${item.validOffer ? 'valid' : 'invalid'} ${item.withdrawalDate ?? ''}`,
      ).includes(normalizedFilter),
    )
  }, [detail?.offers, offerFilter])

  const filteredRemarks = useMemo(() => {
    const rows = detail?.remarks ?? []
    if (!remarkFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(remarkFilter)
    return rows.filter((item) =>
      normalizeText(`${item.title} ${item.remark}`).includes(normalizedFilter),
    )
  }, [detail?.remarks, remarkFilter])

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
            <Tile>
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={
                    !detail.exemptionNumber ||
                    !canPerform('/exemptionSearch') ||
                    !canPerform('/exemptionDetails')
                  }
                  onClick={() => {
                    if (detail.exemptionNumber) {
                      navigate(
                        withCurrentSearch(
                          `/provincial/exemption/${encodeURIComponent(detail.exemptionNumber)}`,
                        ),
                      )
                    }
                  }}
                >
                  Open Exemption Detail
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canPerform('/offersSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/offers'))}
                >
                  Open Offers Search
                </Button>
              </div>
            </Tile>
          </Column>

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
            <Tile>
              <h2 className="detail-tile-title">Packages</h2>
              <TextInput
                id="applicationDetailPackageFilter"
                labelText="Filter packages"
                value={packageFilter}
                onChange={(event) => setPackageFilter(event.target.value)}
                placeholder="Filter by package, pieces, or volume"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Package</TableHeader>
                    <TableHeader>Volume (m3)</TableHeader>
                    <TableHeader>Pieces</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPackages.map((item) => (
                    <TableRow key={item.packageNumber}>
                      <TableCell>{item.packageNumber}</TableCell>
                      <TableCell>{item.volume.toLocaleString()}</TableCell>
                      <TableCell>{item.pieceCount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {filteredPackages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3}>No package rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Tile>
              <h2 className="detail-tile-title">Offers</h2>
              <TextInput
                id="applicationDetailOfferFilter"
                labelText="Filter offers"
                value={offerFilter}
                onChange={(event) => setOfferFilter(event.target.value)}
                placeholder="Filter by offer number, validity, or withdrawal date"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Offer</TableHeader>
                    <TableHeader>Valid</TableHeader>
                    <TableHeader>Withdrawal Date</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOffers.map((item) => (
                    <TableRow key={item.offerNumber}>
                      <TableCell>{item.offerNumber}</TableCell>
                      <TableCell>{item.validOffer ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{item.withdrawalDate ?? '-'}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!canPerform('/offersSearch') || !canPerform('/offerDetails')}
                          onClick={() =>
                            navigate(withCurrentSearch(`/provincial/offers/${item.offerNumber}`))
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOffers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No offer rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">Remarks</h2>
              <TextInput
                id="applicationDetailRemarkFilter"
                labelText="Filter remarks"
                value={remarkFilter}
                onChange={(event) => setRemarkFilter(event.target.value)}
                placeholder="Filter by title or remark text"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Title</TableHeader>
                    <TableHeader>Remark</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRemarks.map((item) => (
                    <TableRow key={`${item.title}-${item.remark}`}>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>{item.remark}</TableCell>
                    </TableRow>
                  ))}
                  {filteredRemarks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2}>No remarks matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialApplicationDetailsPage
