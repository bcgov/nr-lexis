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
import DetailDocumentUploadPanel from '@/components/uploads/DetailDocumentUploadPanel'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import {
  displayValue,
  matchesFilter,
  normalizeFilterText as normalizeText,
} from '@/pages/shared/detail-page-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionDocuments,
  openExemptionDocument,
  removeExemptionDocument,
  type ProvincialExemptionDocumentRow,
} from '@/service/provincial-exemption-documents-service'
import { runReport } from '@/service/report-service'
import { triggerBrowserDownload } from '@/utils/download'

const openBlobInNewTab = (blob: Blob): boolean => {
  const objectUrl = URL.createObjectURL(blob)
  const openedWindow = window.open(
    objectUrl,
    'approvedExemptionReportWindow',
    'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
  )

  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl)
    return false
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
}

const ProvincialExemptionDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { exemptionNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialExemptionDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [isOpeningApprovedExemptionReport, setIsOpeningApprovedExemptionReport] = useState(false)
  const beginDetailRequest = useLatestRequestGuard()
  const permitFilter = searchParams.get('permitFilter') ?? ''
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
    (key: 'permitFilter' | 'remarkFilter' | 'documentsFilter', value: string) => {
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
      if (!exemptionNumber) {
        setErrorMessage('Exemption number is missing from the route.')
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
        const response = await fetchProvincialExemptionDetail(exemptionNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        if (!response) {
          setErrorMessage(`No provincial exemption found for ${exemptionNumber}.`)
          setDocumentRows([])
          return
        }

        try {
          const documentsResult = await fetchExemptionDocuments(exemptionNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setDocumentRows([])
            setDocumentsErrorMessage('Unable to retrieve exemption documents.')
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial exemption detail.')
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
  }, [exemptionNumber, beginDetailRequest])

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

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.name, row.description, row.type, row.id], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const isActiveExemption = useMemo(() => {
    if (!detail) {
      return false
    }
    return (
      normalizeText(detail.exemptionStatusDescription ?? '') === 'active' ||
      normalizeText(detail.exemptionStatusCode ?? '') === 'active'
    )
  }, [detail])

  const canManageDocuments = canPerform('/fileExemptionUpload')

  const onOpenApprovedExemptionReport = useCallback(async () => {
    if (!detail) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsOpeningApprovedExemptionReport(true)
    try {
      const runResult = await runReport({
        reportId: 'approvedExemptionReport',
        actionMapping: 'generate',
        values: {
          exemptionNumber: detail.exemptionNumber,
          outputFormat: 'PDF',
        },
      })

      const opened = openBlobInNewTab(runResult.blob)
      if (!opened) {
        triggerBrowserDownload(runResult.blob, runResult.filename)
        setActionErrorMessage(
          'Popup blocked while opening approved exemption report preview. Downloaded the report file instead.',
        )
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to generate approved exemption report.')
    } finally {
      setIsOpeningApprovedExemptionReport(false)
    }
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

  const refreshExemptionDocuments = useCallback(async () => {
    if (!exemptionNumber) {
      return
    }

    const documentsResult = await fetchExemptionDocuments(exemptionNumber)
    setDocumentRows(documentsResult.rows)
    setDocumentsErrorMessage('')
  }, [exemptionNumber])

  const onOpenExemptionUpload = useCallback(() => {
    if (!detail) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    document.getElementById('exemptionDocumentUpload')?.scrollIntoView({ block: 'start' })
  }, [detail])

  const onOpenDocument = useCallback(async (row: ProvincialExemptionDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const result = await openExemptionDocument(row.id, row.name)
      triggerBrowserDownload(result.blob, result.filename || row.name)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open the selected document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: ProvincialExemptionDocumentRow) => {
      if (!exemptionNumber) {
        return
      }

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeExemptionDocument(row.id)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchExemptionDocuments(exemptionNumber)
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
    [beginDetailRequest, exemptionNumber],
  )

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
                  kind="secondary"
                  size="sm"
                  disabled={!canManageDocuments || !detail.exemptionNumber}
                  onClick={onOpenExemptionUpload}
                >
                  Upload Exemption Document
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={
                    !detail.exemptionNumber ||
                    !canPerform('/approvedExemptionReport') ||
                    isOpeningApprovedExemptionReport
                  }
                  onClick={() => void onOpenApprovedExemptionReport()}
                >
                  {isOpeningApprovedExemptionReport
                    ? 'Opening Approved Exemption Report...'
                    : 'Open Approved Exemption Report'}
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

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Documents <Tag type="green">API</Tag>
              </h2>
              {canManageDocuments && (
                <DetailDocumentUploadPanel
                  workflowType="exemption"
                  targetNumber={detail.exemptionNumber}
                  inputId="exemptionDocumentUpload"
                  disabled={!detail.exemptionNumber}
                  onUploadComplete={refreshExemptionDocuments}
                />
              )}
              <TextInput
                id="exemptionDetailDocumentsFilter"
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
