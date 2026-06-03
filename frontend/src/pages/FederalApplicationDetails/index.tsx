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
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchFederalApplicationDetail } from '@/service/lexis-detail-service'
import {
  fetchFederalApplicationDocuments,
  openFederalApplicationDocument,
  removeFederalApplicationDocument,
  type FederalApplicationDocumentRow,
} from '@/service/federal-application-documents-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

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

const FederalApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<FederalApplicationDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const beginDetailRequest = useLatestRequestGuard()
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
      const isLatestRequest = beginDetailRequest()
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setDocumentRows([])
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
        const response = await fetchFederalApplicationDetail(applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        if (!response) {
          setErrorMessage(`No federal application found for ${applicationNumber}.`)
          setDocumentRows([])
          return
        }

        try {
          const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setDocumentRows([])
            setDocumentsErrorMessage('Unable to retrieve federal application documents.')
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application detail.')
          setDetail(null)
          setDocumentRows([])
          setDocumentsErrorMessage('')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [applicationNumber, beginDetailRequest])

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

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const canAccessFederalSearch =
    canPerform('/federalApplicationSearch') || canPerform('viewFederalApplication')
  const canManageDocuments = canPerform('/fileApplicationUpload')

  const onOpenApplicationUpload = useCallback(() => {
    if (!detail) {
      return
    }
    const resolvedApplicationNumber = String(
      detail.applicationNumber ?? applicationNumber ?? '',
    ).trim()
    if (!resolvedApplicationNumber) {
      setActionErrorMessage('Application number is missing for upload.')
      return
    }
    setActionErrorMessage('')
    setActionInfoMessage('')
    const params = new URLSearchParams({
      type: 'application',
      applicationNumber: resolvedApplicationNumber,
    })
    navigate(`/admin/uploads?${params.toString()}`)
  }, [applicationNumber, detail, navigate])

  const onOpenDocument = useCallback(async (row: FederalApplicationDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const result = await openFederalApplicationDocument(row.id, row.name)
      triggerBrowserDownload(result.blob, result.filename || row.name)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open the selected document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: FederalApplicationDocumentRow) => {
      if (!applicationNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeFederalApplicationDocument(row.id)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchFederalApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to remove the selected document.')
        }
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [applicationNumber, beginDetailRequest],
  )

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
            kind="error"
            title="Detail unavailable"
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
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canManageDocuments || !detail.applicationNumber}
                  onClick={onOpenApplicationUpload}
                >
                  Upload Application Document
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
                onChange={(event) => updateFilterParam('packageFilter', event.target.value)}
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
                onChange={(event) => updateFilterParam('offerFilter', event.target.value)}
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
              <h2 className="detail-tile-title">
                Documents <Tag type="green">API</Tag>
              </h2>
              <TextInput
                id="federalDetailDocumentsFilter"
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
                id="federalDetailRemarkFilter"
                labelText="Filter remarks"
                value={remarkFilter}
                onChange={(event) => updateFilterParam('remarkFilter', event.target.value)}
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
