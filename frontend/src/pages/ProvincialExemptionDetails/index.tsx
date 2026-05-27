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
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const ProvincialExemptionDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { exemptionNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const permitFilter = searchParams.get('permitFilter') ?? ''
  const remarkFilter = searchParams.get('remarkFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (key: 'permitFilter' | 'remarkFilter', value: string) => {
      const nextSearchParams = new URLSearchParams(searchParams)
      if (value.trim().length > 0) {
        nextSearchParams.set(key, value)
      } else {
        nextSearchParams.delete(key)
      }

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true })
      }
    },
    [searchParams, setSearchParams],
  )

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

  const filteredPermitNumbers = useMemo(() => {
    const rows = detail?.permitNumbers ?? []
    if (!permitFilter.trim()) {
      return rows
    }

    const normalizedFilter = normalizeText(permitFilter)
    return rows.filter((permitNumber) => normalizeText(permitNumber).includes(normalizedFilter))
  }, [detail?.permitNumbers, permitFilter])

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

  const isActiveExemption = useMemo(() => {
    if (!detail) {
      return false
    }
    return (
      normalizeText(detail.exemptionStatusDescription ?? '') === 'active' ||
      normalizeText(detail.exemptionStatusCode ?? '') === 'active'
    )
  }, [detail])

  const onCreatePermit = useCallback(() => {
    if (!detail) {
      return
    }

    const params = new URLSearchParams()
    params.set('exemptionNumber', detail.exemptionNumber)
    if (detail.applicationNumber !== null) {
      params.set('applicationNumber', String(detail.applicationNumber))
    }
    if (detail.ownerClientNumber) {
      params.set('ownerClientNumber', detail.ownerClientNumber)
    }
    if (detail.agentClientNumber) {
      params.set('applicantClientNumber', detail.agentClientNumber)
    }

    const query = params.toString()
    navigate(query.length > 0 ? `/provincial/permit/create?${query}` : '/provincial/permit/create')
  }, [detail, navigate])

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
            <Tile>
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canPerform('/exemptionSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/exemption'))}
                >
                  Back to Exemption Search Results
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
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canPerform('/permitSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/permit'))}
                >
                  Open Permit Search
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={
                    !canPerform('/permitSearch') ||
                    !canPerform('createPermit') ||
                    !isActiveExemption
                  }
                  onClick={onCreatePermit}
                >
                  Create Permit
                </Button>
              </div>
            </Tile>
          </Column>

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
            <Tile>
              <h2 className="detail-tile-title">Related Permits</h2>
              <TextInput
                id="exemptionDetailPermitFilter"
                labelText="Filter permits"
                value={permitFilter}
                onChange={(event) => updateFilterParam('permitFilter', event.target.value)}
                placeholder="Filter by permit number"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Permit Number</TableHeader>
                    <TableHeader>Open</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPermitNumbers.map((permitNumber) => (
                    <TableRow key={permitNumber}>
                      <TableCell>{permitNumber}</TableCell>
                      <TableCell>
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!canPerform('/permitSearch') || !canPerform('/permitDetails')}
                          onClick={() =>
                            navigate(withCurrentSearch(`/provincial/permit/${permitNumber}`))
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPermitNumbers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2}>No permits matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Tile>
              <h2 className="detail-tile-title">Remarks</h2>
              <TextInput
                id="exemptionDetailRemarkFilter"
                labelText="Filter remarks"
                value={remarkFilter}
                onChange={(event) => updateFilterParam('remarkFilter', event.target.value)}
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

export default ProvincialExemptionDetailsPage
