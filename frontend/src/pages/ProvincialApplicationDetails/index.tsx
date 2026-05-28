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
import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
  type ProvincialApplicationDocumentRow,
  type ProvincialApplicationDocumentSource,
} from '@/service/provincial-application-documents-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const getLegacyActionBasePath = (): string => {
  const configured = (import.meta.env.VITE_LEXIS_LEGACY_ENDPOINT_BASE ?? '/api').trim()
  if (!configured) {
    return '/api'
  }
  return configured.endsWith('/') ? configured.slice(0, -1) : configured
}

const buildLegacyActionUrl = (
  legacyPath: string,
  values: Record<string, string | undefined>,
): string => {
  const basePath = getLegacyActionBasePath()
  const url = new URL(`${window.location.origin}${basePath}${legacyPath}`)
  Object.entries(values).forEach(([key, value]) => {
    const normalized = (value ?? '').trim()
    if (normalized.length > 0) {
      url.searchParams.set(key, normalized)
    }
  })
  return url.toString()
}

const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

const matchesFilter = (
  values: Array<string | number | null | undefined>,
  filterValue: string,
): boolean => {
  if (!filterValue.trim()) {
    return true
  }

  const normalizedFilter = normalizeText(filterValue)
  return values.some((value) => normalizeText(String(value ?? '')).includes(normalizedFilter))
}

const ProvincialApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialApplicationDocumentRow[]>([])
  const [documentSource, setDocumentSource] = useState<ProvincialApplicationDocumentSource>('api')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const packageFilter = searchParams.get('packageFilter') ?? ''
  const offerFilter = searchParams.get('offerFilter') ?? ''
  const remarkFilter = searchParams.get('remarkFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (key: 'packageFilter' | 'offerFilter' | 'remarkFilter' | 'documentsFilter', value: string) => {
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
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
        setDocumentSource('api')
        setDocumentsErrorMessage('')
        setActionErrorMessage('')
        setActionInfoMessage('')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const response = await fetchProvincialApplicationDetail(applicationNumber)
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial application found for ${applicationNumber}.`)
          setDocumentRows([])
          setDocumentSource('api')
          return
        }

        try {
          const documentsResult = await fetchApplicationDocuments(applicationNumber)
          setDocumentRows(documentsResult.rows)
          setDocumentSource(documentsResult.source)
        } catch (error) {
          console.error(error)
          setDocumentRows([])
          setDocumentSource('api')
          setDocumentsErrorMessage('Unable to retrieve application documents.')
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial application detail.')
        setDetail(null)
        setDocumentRows([])
        setDocumentSource('api')
        setDocumentsErrorMessage('')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [applicationNumber])

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

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const canManageDocuments = canPerform('/fileApplicationUpload')

  const onCreateOffer = useCallback(() => {
    if (!detail) {
      return
    }

    const params = new URLSearchParams()
    params.set('applicationNumber', String(detail.applicationNumber))
    if (detail.packages.length === 1 && detail.packages[0]?.packageNumber) {
      params.set('packageNumber', detail.packages[0].packageNumber)
    }
    if (detail.ownerClientNumber) {
      params.set('offeringClientNumber', detail.ownerClientNumber)
    }
    if (detail.orgUnitNumber !== null) {
      params.set('region', String(detail.orgUnitNumber))
    }

    const query = params.toString()
    navigate(query.length > 0 ? `/provincial/offers/create?${query}` : '/provincial/offers/create')
  }, [detail, navigate])

  const onOpenApplicationUpload = useCallback(() => {
    if (!detail) {
      return
    }

    const uploadUrl = buildLegacyActionUrl('/fileApplicationUpload.do', {
      actionMapping: 'view',
      applicationNumber: String(detail.applicationNumber),
    })

    const uploadWindow = window.open(
      uploadUrl,
      'applicationUploadWindow',
      'height=250,width=500,menubar=0,resizable=0,status=1,scrollbars=0',
    )

    if (!uploadWindow) {
      setActionErrorMessage('Unable to open the application upload window. Allow popups and retry.')
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
  }, [detail])

  const onOpenDocument = useCallback(async (row: ProvincialApplicationDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const result = await openApplicationDocument(row.id, row.name)
      if (result.source === 'legacy') {
        const openedWindow = window.open(result.legacyUrl, 'applicationDocumentWindow')
        if (!openedWindow) {
          setActionErrorMessage('Unable to open the document window. Allow popups and retry.')
        }
        return
      }

      triggerBrowserDownload(result.blob, result.filename || row.name)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open the selected document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: ProvincialApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeApplicationDocument(row.id)
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchApplicationDocuments(applicationNumber)
        setDocumentRows(documentsResult.rows)
        setDocumentSource(documentsResult.source)

        if (removeResult.source === 'legacy' || documentsResult.source === 'legacy') {
          setActionInfoMessage('Document action completed through legacy fallback.')
        }
      } catch (error) {
        console.error(error)
        setActionErrorMessage('Unable to remove the selected document.')
      } finally {
        setIsRemovingDocumentId(null)
      }
    },
    [applicationNumber],
  )

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
          {!!documentsErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="warning"
                title="Documents unavailable"
                subtitle={documentsErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="error"
                title="Action failed"
                subtitle={actionErrorMessage}
                lowContrast
              />
            </Column>
          )}
          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="info"
                title="Action completed"
                subtitle={actionInfoMessage}
                lowContrast
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">Actions</h2>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canPerform('/applicationSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/application'))}
                >
                  Back to Application Search Results
                </Button>
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
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canManageDocuments || !detail.applicationNumber}
                  onClick={onOpenApplicationUpload}
                >
                  Upload Application Document
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={
                    !canPerform('/offersSearch') ||
                    !canPerform('createOffer') ||
                    !detail.canCreateOffers ||
                    detail.industryUser ||
                    detail.packages.length === 0
                  }
                  onClick={onCreateOffer}
                >
                  Create Offer
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
                onChange={(event) => updateFilterParam('packageFilter', event.target.value)}
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
                onChange={(event) => updateFilterParam('offerFilter', event.target.value)}
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
              <h2 className="detail-tile-title">
                Documents{' '}
                <Tag type={documentSource === 'api' ? 'green' : 'gray'}>
                  {documentSource === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="applicationDetailDocumentsFilter"
                labelText="Filter document rows"
                value={documentsFilter}
                onChange={(event) => updateFilterParam('documentsFilter', event.target.value)}
                placeholder="Filter by file name, description, type, or id"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>File Name</TableHeader>
                    <TableHeader>Description</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDocumentRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name || '-'}</TableCell>
                      <TableCell>{row.description || '-'}</TableCell>
                      <TableCell>{row.type || '-'}</TableCell>
                      <TableCell>
                        <div className="legacy-search-actions">
                          <Button kind="ghost" size="sm" onClick={() => void onOpenDocument(row)}>
                            Open
                          </Button>
                          <Button
                            kind="danger--ghost"
                            size="sm"
                            disabled={!canManageDocuments || isRemovingDocumentId === row.id}
                            onClick={() => void onRemoveDocument(row)}
                          >
                            {isRemovingDocumentId === row.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDocumentRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        No document rows matched the current filter.
                      </TableCell>
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

export default ProvincialApplicationDetailsPage
