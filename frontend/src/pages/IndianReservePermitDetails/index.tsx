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
  TextInput,
  Tile,
} from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import type { IndianReservePermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchIndianReservePermitDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const IndianReservePermitDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<IndianReservePermitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const packageFilter = searchParams.get('packageFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (value: string) => {
      const nextSearchParams = new URLSearchParams(searchParams)
      if (value.trim().length > 0) {
        nextSearchParams.set('packageFilter', value)
      } else {
        nextSearchParams.delete('packageFilter')
      }

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

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
          setErrorMessage(`No indigenous reserve permit found for ${permitNumber}.`)
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve indigenous reserve permit detail.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [permitNumber])

  const filteredPackages = useMemo(() => {
    const rows = detail?.packages ?? []
    if (!packageFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(packageFilter)
    return rows.filter((item) => normalizeText(item).includes(normalizedFilter))
  }, [detail?.packages, packageFilter])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Indigenous Reserve Permit Details</h1>
        <p>
          Permit <code>{permitNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading indigenous reserve permit detail..." />
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
                    !canPerform('/indianReservePermitSearch') && !canPerform('viewOICApplication')
                  }
                  onClick={() => navigate(withCurrentSearch('/indian-reserve'))}
                >
                  Back to Reserve Search Results
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={
                    !canPerform('/indianReservePermitSearch') && !canPerform('viewOICApplication')
                  }
                  onClick={() => navigate(withCurrentSearch('/indian-reserve/permit/create'))}
                >
                  Create Reserve Permit
                </Button>
              </div>
            </Tile>
          </Column>

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
            <Tile>
              <h2 className="detail-tile-title">Packages</h2>
              <TextInput
                id="reservePermitPackageFilter"
                labelText="Filter packages"
                value={packageFilter}
                onChange={(event) => updateFilterParam(event.target.value)}
                placeholder="Filter package identifiers"
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
        </>
      )}
    </Grid>
  )
}

export default IndianReservePermitDetailsPage
