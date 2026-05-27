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
import { env } from '@/env'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile, DetailListTile, type DetailListItem } from '@/pages/shared/DetailSections'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  fetchProvincialPermitDetailTabs,
  type ProvincialPermitDetailTabsData,
  type ProvincialPermitDetailTabsSources,
} from '@/service/provincial-permit-detail-tabs-service'
import { runReport } from '@/service/report-service'

const displayValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not provided'
  }
  return String(value)
}

const formatAmount = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const getLegacyActionBasePath = (): string => {
  const configured = (env.VITE_LEXIS_LEGACY_ENDPOINT_BASE ?? '/api').trim()
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
    if (!value) {
      return
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }
    url.searchParams.set(key, trimmed)
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

const openBlobInNewTab = (blob: Blob): boolean => {
  const objectUrl = URL.createObjectURL(blob)
  const openedWindow = window.open(
    objectUrl,
    'permitReportWindow',
    'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
  )

  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl)
    return false
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  return true
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

const ProvincialPermitDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [tabsData, setTabsData] = useState<ProvincialPermitDetailTabsData | null>(null)
  const [tabsSources, setTabsSources] = useState<ProvincialPermitDetailTabsSources | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [tabsErrorMessage, setTabsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isOpeningPermitReport, setIsOpeningPermitReport] = useState(false)
  const itemsFilter = searchParams.get('itemsFilter') ?? ''
  const feesFilter = searchParams.get('feesFilter') ?? ''
  const gbmsFilter = searchParams.get('gbmsFilter') ?? ''
  const oicFilter = searchParams.get('oicFilter') ?? ''
  const boicFilter = searchParams.get('boicFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (
      key: 'itemsFilter' | 'feesFilter' | 'gbmsFilter' | 'oicFilter' | 'boicFilter',
      value: string,
    ) => {
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
      if (!permitNumber) {
        setErrorMessage('Permit number is missing from the route.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setTabsErrorMessage('')

      try {
        const response = await fetchProvincialPermitDetail(permitNumber)
        setDetail(response)

        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
          setTabsData(null)
          setTabsSources(null)
          return
        }

        try {
          const tabsResult = await fetchProvincialPermitDetailTabs(permitNumber, {
            permitVolume: response.permitVolume,
            numberOfPieces: response.numberOfPieces,
            invoiceNumber: response.invoiceNumber,
            receiptNumber: response.receiptNumber,
            issueDate: response.issueDate,
          })
          setTabsData(tabsResult.data)
          setTabsSources(tabsResult.sources)
        } catch (error) {
          console.error(error)
          setTabsData(null)
          setTabsSources(null)
          setTabsErrorMessage('Unable to retrieve permit item and fee tables.')
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial permit detail.')
        setTabsData(null)
        setTabsSources(null)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [permitNumber])

  const documentItems = useMemo<DetailListItem[]>(() => {
    if (!detail) {
      return []
    }

    const items: DetailListItem[] = []
    if (detail.invoiceNumber) {
      items.push({
        key: `invoice-${detail.invoiceNumber}`,
        content: `Invoice: ${detail.invoiceNumber}`,
      })
    }
    if (detail.federalPermitNumber) {
      items.push({
        key: `federal-${detail.federalPermitNumber}`,
        content: `Federal Permit: ${detail.federalPermitNumber}`,
      })
    }

    if (detail.remarks) {
      items.push({
        key: 'remarks',
        content: `Remarks: ${detail.remarks}`,
      })
    }

    return items
  }, [detail])

  const filteredItems = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.items.filter((row) =>
      matchesFilter(
        [row.id, row.timberMark, row.species, row.grade, row.pieces, row.volume],
        itemsFilter,
      ),
    )
  }, [itemsFilter, tabsData])

  const filteredFees = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.fees.filter((row) =>
      matchesFilter(
        [
          row.id,
          row.feeCode,
          row.feeDescription,
          row.amount,
          row.status,
          row.invoiceNumber,
          row.receiptNumber,
        ],
        feesFilter,
      ),
    )
  }, [feesFilter, tabsData])

  const filteredGbmsEvents = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.gbmsEvents.filter((row) =>
      matchesFilter(
        [row.id, row.eventDate, row.eventType, row.status, row.reference, row.notes],
        gbmsFilter,
      ),
    )
  }, [gbmsFilter, tabsData])

  const filteredOicItems = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.oicItems.filter((row) =>
      matchesFilter(
        [row.id, row.eventDate, row.eventType, row.status, row.reference, row.notes],
        oicFilter,
      ),
    )
  }, [oicFilter, tabsData])

  const filteredBoicItems = useMemo(() => {
    if (!tabsData) {
      return []
    }

    return tabsData.boicItems.filter((row) =>
      matchesFilter(
        [row.id, row.eventDate, row.eventType, row.status, row.reference, row.notes],
        boicFilter,
      ),
    )
  }, [boicFilter, tabsData])

  const usesAnyMockTabData = useMemo(() => {
    if (!tabsSources) {
      return false
    }

    return Object.values(tabsSources).some((source) => source === 'mock')
  }, [tabsSources])

  const onOpenPermitReport = useCallback(async () => {
    if (!detail) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsOpeningPermitReport(true)
    try {
      const runResult = await runReport({
        reportId: 'permitReport',
        legacyPath: '/permitReport.do',
        actionMapping: 'generate',
        values: {
          permitNumber: String(detail.permitNumber ?? permitNumber ?? ''),
          outputFormat: 'PDF',
        },
      })

      if (runResult.source === 'api') {
        const opened = openBlobInNewTab(runResult.blob)
        if (!opened) {
          triggerBrowserDownload(runResult.blob, runResult.filename)
          setActionErrorMessage(
            'Popup blocked while opening permit report preview. Downloaded the report file instead.',
          )
        }
        return
      }

      setActionInfoMessage(
        'Permit report API is not available yet. Opened the legacy permit report endpoint.',
      )
      const fallbackWindow = window.open(
        runResult.legacyUrl,
        'permitReportWindow',
        'height=900,width=1280,menubar=0,resizable=1,status=1,scrollbars=1',
      )

      if (!fallbackWindow) {
        setActionErrorMessage('Unable to open permit report window. Enable popups and retry.')
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to generate permit report.')
    } finally {
      setIsOpeningPermitReport(false)
    }
  }, [detail, permitNumber])

  const onOpenPermitUpload = useCallback(() => {
    if (!detail?.permitNumber) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    const uploadUrl = buildLegacyActionUrl('/filePermitUpload.do', {
      actionMapping: 'view',
      permitNumber: String(detail.permitNumber),
    })
    const popup = window.open(
      uploadUrl,
      'permitUploadWindow',
      'height=350,width=700,menubar=0,status=1,resizable=1,scrollbars=1',
    )
    if (!popup) {
      setActionErrorMessage('Unable to open permit upload window. Enable popups and retry.')
    }
  }, [detail?.permitNumber])

  const onOpenInvoiceUpload = useCallback(() => {
    if (!detail?.permitNumber) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    const uploadUrl = buildLegacyActionUrl('/fileInvoiceUpload.do', {
      actionMapping: 'view',
      permitNumber: String(detail.permitNumber),
      // TODO: wire live conversion-rate lookup when endpoint parity lands.
      invoiceConversionRate: '1.00',
    })
    const popup = window.open(
      uploadUrl,
      'invoiceUploadWindow',
      'height=550,width=760,menubar=0,status=1,resizable=1,scrollbars=1',
    )
    if (!popup) {
      setActionErrorMessage('Unable to open invoice upload window. Enable popups and retry.')
    }
  }, [detail?.permitNumber])

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <h1>Provincial Permit Details</h1>
        <p>
          Permit <code>{permitNumber}</code>
        </p>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial permit detail..." />
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

      {!loading && !!tabsErrorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind="warning"
            title="Permit Tables Unavailable"
            subtitle={tabsErrorMessage}
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
                  disabled={!canPerform('/permitSearch')}
                  onClick={() => navigate(withCurrentSearch('/provincial/permit'))}
                >
                  Back to Permit Search Results
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  disabled={isOpeningPermitReport || !canPerform('/permitSearch')}
                  onClick={() => void onOpenPermitReport()}
                >
                  {isOpeningPermitReport ? 'Opening Permit Report...' : 'Open Permit Report'}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!detail.permitNumber || !canPerform('/filePermitUpload')}
                  onClick={onOpenPermitUpload}
                >
                  Upload Permit Document
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!detail.permitNumber || !canPerform('/fileInvoiceUpload')}
                  onClick={onOpenInvoiceUpload}
                >
                  Upload Invoice
                </Button>
              </div>
            </Tile>
          </Column>

          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="info"
                title="Legacy Fallback Used"
                subtitle={actionInfoMessage}
                lowContrast
                onCloseButtonClick={() => setActionInfoMessage('')}
              />
            </Column>
          )}

          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="error"
                title="Action Failed"
                subtitle={actionErrorMessage}
                lowContrast
                onCloseButtonClick={() => setActionErrorMessage('')}
              />
            </Column>
          )}

          {usesAnyMockTabData && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                kind="info"
                title="Using Fallback Tab Data"
                subtitle="One or more permit detail tabs are currently using local fallback rows while Spring endpoints are finalized."
                lowContrast
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16}>
            <DetailFieldTile
              title="Permit Summary"
              fields={[
                { label: 'Permit Number', value: displayValue(detail.permitNumber) },
                { label: 'Application Number', value: displayValue(detail.applicationNumber) },
                { label: 'Package Number', value: displayValue(detail.packageNumber) },
                { label: 'Exemption Number', value: displayValue(detail.exemptionNumber) },
                {
                  label: 'Status',
                  value: displayValue(detail.permitStatusDescription ?? detail.permitStatusCode),
                },
                { label: 'Issue Date', value: displayValue(detail.issueDate) },
                { label: 'Expiry Date', value: displayValue(detail.expiryDate) },
                { label: 'Received Date', value: displayValue(detail.receivedDate) },
                { label: 'Region', value: displayValue(detail.region) },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailFieldTile
              title="Shipping"
              fields={[
                {
                  label: 'Destination Company',
                  value: displayValue(detail.destinationCompanyName),
                },
                {
                  label: 'Destination Country',
                  value: displayValue(detail.destinationCountryCode),
                },
                { label: 'Transport Type', value: displayValue(detail.transportTypeCode) },
                { label: 'Transport Name', value: displayValue(detail.transportName) },
                { label: 'Port Of Export', value: displayValue(detail.portOfExportCode) },
                { label: 'Other Port Of Export', value: displayValue(detail.otherPortOfExport) },
                {
                  label: 'Estimated Shipping Date',
                  value: displayValue(detail.estimatedShippingDate),
                },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailFieldTile
              title="Financial and Volume"
              fields={[
                { label: 'Permit Volume (m3)', value: displayValue(detail.permitVolume) },
                { label: 'Number Of Pieces', value: displayValue(detail.numberOfPieces) },
                { label: 'Receipt Number', value: displayValue(detail.receiptNumber) },
                { label: 'Invoice Number', value: displayValue(detail.invoiceNumber) },
                { label: 'Federal Permit Number', value: displayValue(detail.federalPermitNumber) },
                {
                  label: 'Applicant Client Number',
                  value: displayValue(detail.applicantClientNumber),
                },
                { label: 'Owner Client Number', value: displayValue(detail.ownerClientNumber) },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Permit Items{' '}
                <Tag type={tabsSources?.items === 'api' ? 'green' : 'gray'}>
                  {tabsSources?.items === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="permitItemsFilter"
                labelText="Filter item rows"
                value={itemsFilter}
                onChange={(event) => updateFilterParam('itemsFilter', event.target.value)}
                placeholder="Filter by mark, species, grade, pieces, or volume"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Item</TableHeader>
                    <TableHeader>Timber Mark</TableHeader>
                    <TableHeader>Species</TableHeader>
                    <TableHeader>Grade</TableHeader>
                    <TableHeader>Pieces</TableHeader>
                    <TableHeader>Volume (m3)</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>{row.timberMark || '-'}</TableCell>
                      <TableCell>{row.species || '-'}</TableCell>
                      <TableCell>{row.grade || '-'}</TableCell>
                      <TableCell>{row.pieces.toLocaleString()}</TableCell>
                      <TableCell>{row.volume.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        No permit item rows matched the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Fee Ledger{' '}
                <Tag type={tabsSources?.fees === 'api' ? 'green' : 'gray'}>
                  {tabsSources?.fees === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="permitFeesFilter"
                labelText="Filter fee rows"
                value={feesFilter}
                onChange={(event) => updateFilterParam('feesFilter', event.target.value)}
                placeholder="Filter by fee code, status, invoice, receipt, or amount"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Fee Code</TableHeader>
                    <TableHeader>Description</TableHeader>
                    <TableHeader>Amount</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Invoice</TableHeader>
                    <TableHeader>Receipt</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredFees.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.feeCode || '-'}</TableCell>
                      <TableCell>{row.feeDescription || '-'}</TableCell>
                      <TableCell>${formatAmount(row.amount)}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell>{row.invoiceNumber || '-'}</TableCell>
                      <TableCell>{row.receiptNumber || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredFees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>No fee rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                GBMS Events{' '}
                <Tag type={tabsSources?.gbmsEvents === 'api' ? 'green' : 'gray'}>
                  {tabsSources?.gbmsEvents === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="permitGbmsFilter"
                labelText="Filter GBMS rows"
                value={gbmsFilter}
                onChange={(event) => updateFilterParam('gbmsFilter', event.target.value)}
                placeholder="Filter by type, status, date, reference, or notes"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Reference</TableHeader>
                    <TableHeader>Notes</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredGbmsEvents.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.eventDate || '-'}</TableCell>
                      <TableCell>{row.eventType || '-'}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell>{row.reference || '-'}</TableCell>
                      <TableCell>{row.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredGbmsEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>No GBMS rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={8}>
            <Tile>
              <h2 className="detail-tile-title">
                OIC Items{' '}
                <Tag type={tabsSources?.oicItems === 'api' ? 'green' : 'gray'}>
                  {tabsSources?.oicItems === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="permitOicFilter"
                labelText="Filter OIC rows"
                value={oicFilter}
                onChange={(event) => updateFilterParam('oicFilter', event.target.value)}
                placeholder="Filter by type, status, date, reference, or notes"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Reference</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOicItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.eventDate || '-'}</TableCell>
                      <TableCell>{row.eventType || '-'}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell>{row.reference || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredOicItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No OIC rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={8}>
            <Tile>
              <h2 className="detail-tile-title">
                BOIC Items{' '}
                <Tag type={tabsSources?.boicItems === 'api' ? 'green' : 'gray'}>
                  {tabsSources?.boicItems === 'api' ? 'API' : 'Fallback'}
                </Tag>
              </h2>
              <TextInput
                id="permitBoicFilter"
                labelText="Filter BOIC rows"
                value={boicFilter}
                onChange={(event) => updateFilterParam('boicFilter', event.target.value)}
                placeholder="Filter by type, status, date, reference, or notes"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Reference</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBoicItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.eventDate || '-'}</TableCell>
                      <TableCell>{row.eventType || '-'}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell>{row.reference || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredBoicItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>No BOIC rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailListTile
              title="Documents and Notes"
              items={documentItems}
              emptyLabel="No document references available."
            />
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailFieldTile
              title="Tab Data Sources"
              fields={[
                { label: 'Items', value: tabsSources?.items === 'api' ? 'API' : 'Fallback' },
                { label: 'Fees', value: tabsSources?.fees === 'api' ? 'API' : 'Fallback' },
                {
                  label: 'GBMS Events',
                  value: tabsSources?.gbmsEvents === 'api' ? 'API' : 'Fallback',
                },
                { label: 'OIC Items', value: tabsSources?.oicItems === 'api' ? 'API' : 'Fallback' },
                {
                  label: 'BOIC Items',
                  value: tabsSources?.boicItems === 'api' ? 'API' : 'Fallback',
                },
              ]}
            />
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialPermitDetailsPage
