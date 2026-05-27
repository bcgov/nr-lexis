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
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchFederalApplicationDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const FederalApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
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
    return rows.filter((item) => normalizeText(item).includes(normalizedFilter))
  }, [detail?.packages, packageFilter])

  const filteredOffers = useMemo(() => {
    const rows = detail?.offers ?? []
    if (!offerFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(offerFilter)
    return rows.filter((item) => normalizeText(item).includes(normalizedFilter))
  }, [detail?.offers, offerFilter])

  const filteredRemarks = useMemo(() => {
    const rows = detail?.remarks ?? []
    if (!remarkFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(remarkFilter)
    return rows.filter((item) => normalizeText(item).includes(normalizedFilter))
  }, [detail?.remarks, remarkFilter])

  const canAccessFederalSearch =
    canPerform('/federalApplicationSearch') || canPerform('viewFederalApplication')

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
            <Tile>
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canAccessFederalSearch}
                  onClick={() => navigate(withCurrentSearch('/federal'))}
                >
                  Back to Federal Search Results
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
                  Open Provincial Application
                </Button>
              </div>
            </Tile>
          </Column>

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
            <Tile>
              <h2 className="detail-tile-title">Packages</h2>
              <TextInput
                id="federalDetailPackageFilter"
                labelText="Filter packages"
                value={packageFilter}
                onChange={(event) => setPackageFilter(event.target.value)}
                placeholder="Filter by package identifier"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Package</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPackages.map((item) => (
                    <TableRow key={item}>
                      <TableCell>{item}</TableCell>
                    </TableRow>
                  ))}
                  {filteredPackages.length === 0 && (
                    <TableRow>
                      <TableCell>No packages matched the current filter.</TableCell>
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
                id="federalDetailOfferFilter"
                labelText="Filter offers"
                value={offerFilter}
                onChange={(event) => setOfferFilter(event.target.value)}
                placeholder="Filter by offer reference"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Offer Reference</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOffers.map((item) => (
                    <TableRow key={item}>
                      <TableCell>{item}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!canPerform('/offersSearch') || !canPerform('/offerDetails')}
                          onClick={() =>
                            navigate(
                              withCurrentSearch(`/provincial/offers/${encodeURIComponent(item)}`),
                            )
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOffers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2}>No offers matched the current filter.</TableCell>
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
                id="federalDetailRemarkFilter"
                labelText="Filter remarks"
                value={remarkFilter}
                onChange={(event) => setRemarkFilter(event.target.value)}
                placeholder="Filter remark text"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Remark</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRemarks.map((item) => (
                    <TableRow key={item}>
                      <TableCell>{item}</TableCell>
                    </TableRow>
                  ))}
                  {filteredRemarks.length === 0 && (
                    <TableRow>
                      <TableCell>No remarks matched the current filter.</TableCell>
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

export default FederalApplicationDetailsPage
