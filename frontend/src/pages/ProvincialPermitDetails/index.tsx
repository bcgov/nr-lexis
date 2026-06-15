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
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import {
  firstValidationError,
  getVisibleFieldError,
  numericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  addPermitInvoice,
  fetchPermitDocuments,
  fetchPermitInvoiceConversionRate,
  fetchPermitInvoices,
  openPermitDocument,
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
  type PermitDocumentRow,
  type PermitInvoiceRow,
} from '@/service/provincial-permit-documents-invoices-service'
import {
  EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS,
  fetchProvincialPermitDetailTabs,
  type ProvincialPermitDetailTabsData,
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

const isInvoiceDocumentRow = (row: PermitDocumentRow): boolean => {
  const normalizedTypeCode = row.typeCode.trim().toUpperCase()
  if (normalizedTypeCode === 'INV' || normalizedTypeCode === 'V') {
    return true
  }

  return row.type.trim().toUpperCase().includes('INVOICE')
}

const isApplicationDocumentRow = (row: PermitDocumentRow): boolean => {
  return row.typeCode.trim().toUpperCase() === 'INS'
}

type PermitInvoiceField = 'invoiceDraftNumber' | 'invoiceDraftExportValue' | 'invoiceDraftFeeInLieu'

const ProvincialPermitDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [tabsData, setTabsData] = useState<ProvincialPermitDetailTabsData | null>(null)
  const [documentRows, setDocumentRows] = useState<PermitDocumentRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<PermitInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsInvoicesErrorMessage, setDocumentsInvoicesErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isOpeningPermitReport, setIsOpeningPermitReport] = useState(false)
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [invoiceDraftNumber, setInvoiceDraftNumber] = useState('')
  const [invoiceDraftExportValue, setInvoiceDraftExportValue] = useState('')
  const [invoiceDraftFeeInLieu, setInvoiceDraftFeeInLieu] = useState('')
  const [isAddingInvoice, setIsAddingInvoice] = useState(false)
  const [touchedInvoiceFields, setTouchedInvoiceFields] = useState<
    TouchedFields<PermitInvoiceField>
  >({})
  const [showInvoiceValidationErrors, setShowInvoiceValidationErrors] = useState(false)
  const beginDetailRequest = useLatestRequestGuard()
  const beginDocumentRefreshRequest = useLatestRequestGuard()
  const beginAddInvoiceRequest = useLatestRequestGuard()
  const beginInvoiceUploadRequest = useLatestRequestGuard()
  const itemsFilter = searchParams.get('itemsFilter') ?? ''
  const feesFilter = searchParams.get('feesFilter') ?? ''
  const gbmsFilter = searchParams.get('gbmsFilter') ?? ''
  const oicFilter = searchParams.get('oicFilter') ?? ''
  const boicFilter = searchParams.get('boicFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const invoicesFilter = searchParams.get('invoicesFilter') ?? ''
  const withCurrentSearch = useCallback(
    (path: string): string => {
      const query = searchParams.toString()
      return query.length > 0 ? `${path}?${query}` : path
    },
    [searchParams],
  )
  const updateFilterParam = useCallback(
    (
      key:
        | 'itemsFilter'
        | 'feesFilter'
        | 'gbmsFilter'
        | 'oicFilter'
        | 'boicFilter'
        | 'documentsFilter'
        | 'invoicesFilter',
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
      const isLatestRequest = beginDetailRequest()
      if (!permitNumber) {
        setErrorMessage('Permit number is missing from the route.')
        setDetail(null)
        setTabsData(null)
        setDocumentRows([])
        setInvoiceRows([])
        setDocumentsInvoicesErrorMessage('')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setDocumentsInvoicesErrorMessage('')

      try {
        const response = await fetchProvincialPermitDetail(permitNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)

        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
          setTabsData(null)
          setDocumentRows([])
          setInvoiceRows([])
          return
        }

        try {
          const tabsResult = await fetchProvincialPermitDetailTabs({
            permitNumber,
            receiptNumber: response.receiptNumber,
          })
          if (isLatestRequest()) {
            setTabsData(tabsResult)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setTabsData(EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS)
          }
        }

        try {
          const documentsResult = await fetchPermitDocuments(permitNumber)
          const invoicesResult = await fetchPermitInvoices(permitNumber)
          if (isLatestRequest()) {
            setDocumentRows(documentsResult.rows)
            setInvoiceRows(invoicesResult.rows)
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setDocumentRows([])
            setInvoiceRows([])
            setDocumentsInvoicesErrorMessage(
              'Unable to retrieve permit documents or invoice details.',
            )
          }
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial permit detail.')
          setDetail(null)
          setTabsData(null)
          setDocumentRows([])
          setInvoiceRows([])
          setDocumentsInvoicesErrorMessage('')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [permitNumber, beginDetailRequest])

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

  const filteredDocumentRows = useMemo(() => {
    return documentRows.filter((row) =>
      matchesFilter([row.id, row.name, row.description, row.type, row.typeCode], documentsFilter),
    )
  }, [documentRows, documentsFilter])

  const filteredInvoiceRows = useMemo(() => {
    return invoiceRows.filter((row) =>
      matchesFilter(
        [
          row.invoiceNumber,
          row.exportValueCad,
          row.conversionRate,
          row.feeInLieu,
          row.invoiceFound ? 'found' : 'missing',
        ],
        invoicesFilter,
      ),
    )
  }, [invoiceRows, invoicesFilter])

  const canDeletePermitDocuments = canPerform('/filePermitUpload')
  const canDeleteInvoiceDocuments = canPerform('/fileInvoiceUpload')
  const invoiceFieldErrors = useMemo<FieldErrors<PermitInvoiceField>>(
    () => ({
      invoiceDraftNumber: requiredFieldError(invoiceDraftNumber, 'Invoice number') ?? undefined,
      invoiceDraftExportValue: firstValidationError(
        () => requiredFieldError(invoiceDraftExportValue, 'Invoice export value'),
        () => numericFieldError(invoiceDraftExportValue, 'Invoice export value'),
      ),
      invoiceDraftFeeInLieu: numericFieldError(invoiceDraftFeeInLieu, 'Fee in lieu') ?? undefined,
    }),
    [invoiceDraftExportValue, invoiceDraftFeeInLieu, invoiceDraftNumber],
  )
  const hasInvoiceValidationError = Object.values(invoiceFieldErrors).some((error) => !!error)

  const markInvoiceFieldTouched = (field: PermitInvoiceField): void => {
    setTouchedInvoiceFields((current) => ({ ...current, [field]: true }))
  }

  const invoiceFieldError = (field: PermitInvoiceField): string | undefined =>
    getVisibleFieldError(
      field,
      invoiceFieldErrors,
      touchedInvoiceFields,
      showInvoiceValidationErrors,
    )

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
        actionMapping: 'generate',
        values: {
          permitNumber: String(detail.permitNumber ?? permitNumber ?? ''),
          outputFormat: 'PDF',
        },
      })

      const opened = openBlobInNewTab(runResult.blob)
      if (!opened) {
        triggerBrowserDownload(runResult.blob, runResult.filename)
        setActionErrorMessage(
          'Popup blocked while opening permit report preview. Downloaded the report file instead.',
        )
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to generate permit report.')
    } finally {
      setIsOpeningPermitReport(false)
    }
  }, [detail, permitNumber])

  const refreshPermitDocuments = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber) {
      return
    }

    const documentsResult = await fetchPermitDocuments(resolvedPermitNumber)
    const invoicesResult = await fetchPermitInvoices(resolvedPermitNumber)
    setDocumentRows(documentsResult.rows)
    setInvoiceRows(invoicesResult.rows)
    setDocumentsInvoicesErrorMessage('')
  }, [detail?.permitNumber, permitNumber])

  const onOpenPermitUpload = useCallback(() => {
    if (!detail?.permitNumber) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    document.getElementById('permitDocumentUpload')?.scrollIntoView({ block: 'start' })
  }, [detail?.permitNumber])

  const onOpenDocument = useCallback(async (row: PermitDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')
    try {
      const result = await openPermitDocument(row.id, row.name)
      triggerBrowserDownload(result.blob, result.filename)
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to open permit document.')
    }
  }, [])

  const onRemoveDocument = useCallback(
    async (row: PermitDocumentRow) => {
      const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
      if (!resolvedPermitNumber) {
        return
      }

      const invoiceDocument = isInvoiceDocumentRow(row)
      if (!canDeletePermitDocuments || (invoiceDocument && !canDeleteInvoiceDocuments)) {
        return
      }

      const isLatestRequest = beginDocumentRefreshRequest()
      setActionErrorMessage('')
      setActionInfoMessage('')
      setIsRemovingDocumentId(row.id)
      try {
        const removeResult = invoiceDocument
          ? await removePermitInvoiceDocument(row.id)
          : isApplicationDocumentRow(row)
            ? await removePermitApplicationDocument(row.id)
            : await removePermitDocument(row.id)

        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Unable to remove selected document.')
          return
        }

        const documentsResult = await fetchPermitDocuments(resolvedPermitNumber)
        const invoicesResult = await fetchPermitInvoices(resolvedPermitNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
          setInvoiceRows(invoicesResult.rows)
          setDocumentsInvoicesErrorMessage('')
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setActionErrorMessage('Unable to remove selected document.')
        }
      } finally {
        if (isLatestRequest()) {
          setIsRemovingDocumentId(null)
        }
      }
    },
    [
      beginDocumentRefreshRequest,
      canDeleteInvoiceDocuments,
      canDeletePermitDocuments,
      detail?.permitNumber,
      permitNumber,
      setDocumentRows,
      setInvoiceRows,
    ],
  )

  const onAddInvoice = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber) {
      return
    }

    const salesInvoiceNumber = invoiceDraftNumber.trim()
    const invoiceExportValue = invoiceDraftExportValue.trim()
    const invoiceFeeInLieu = invoiceDraftFeeInLieu.trim() || invoiceExportValue

    if (hasInvoiceValidationError) {
      setShowInvoiceValidationErrors(true)
      setActionErrorMessage(
        Object.values(invoiceFieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before adding an invoice.',
      )
      return
    }

    const isLatestRequest = beginAddInvoiceRequest()
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsAddingInvoice(true)
    try {
      let conversionRate = '1.00'
      try {
        const conversionResult = await fetchPermitInvoiceConversionRate()
        if (!isLatestRequest()) {
          return
        }
        conversionRate = conversionResult.conversionRate || conversionRate
      } catch (error) {
        if (!isLatestRequest()) {
          return
        }
        console.error(error)
        setActionInfoMessage(
          'Unable to retrieve conversion rate for invoice add. Using default conversion rate of 1.00.',
        )
      }

      const addResult = await addPermitInvoice({
        permitNumber: resolvedPermitNumber,
        salesInvoiceNumber,
        invoiceExportValue,
        invoiceConversionRate: conversionRate,
        invoiceFeeInLieu,
      })

      if (!isLatestRequest()) {
        return
      }
      if (!addResult.success) {
        setActionErrorMessage(addResult.errors[0] || addResult.message || 'Unable to add invoice.')
        return
      }

      const refreshedInvoices = await fetchPermitInvoices(resolvedPermitNumber)
      if (isLatestRequest()) {
        setInvoiceRows(refreshedInvoices.rows)
        setDocumentsInvoicesErrorMessage('')
        setInvoiceDraftNumber('')
        setInvoiceDraftExportValue('')
        setInvoiceDraftFeeInLieu('')
        setShowInvoiceValidationErrors(false)
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to add invoice.')
      }
    } finally {
      if (isLatestRequest()) {
        setIsAddingInvoice(false)
      }
    }
  }, [
    beginAddInvoiceRequest,
    detail?.permitNumber,
    hasInvoiceValidationError,
    invoiceFieldErrors,
    invoiceDraftExportValue,
    invoiceDraftFeeInLieu,
    invoiceDraftNumber,
    permitNumber,
  ])

  const onOpenInvoiceUpload = useCallback(async () => {
    if (!detail?.permitNumber) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    const isLatestRequest = beginInvoiceUploadRequest()
    let conversionRate = '1.00'
    try {
      const conversionResult = await fetchPermitInvoiceConversionRate()
      if (!isLatestRequest()) {
        return
      }
      conversionRate = conversionResult.conversionRate || conversionRate
    } catch (error) {
      if (!isLatestRequest()) {
        return
      }
      console.error(error)
      setActionInfoMessage('Unable to retrieve conversion rate. Using 1.00 for invoice upload.')
    }

    const params = new URLSearchParams({
      type: 'invoice',
      permitNumber: String(detail.permitNumber),
      invoiceConversionRate: conversionRate,
    })
    if (isLatestRequest()) {
      navigate(`/admin/uploads?${params.toString()}`)
    }
  }, [beginInvoiceUploadRequest, detail?.permitNumber, navigate])

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
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
          />
        </Column>
      )}

      {!loading && !!documentsInvoicesErrorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind="warning"
            title="Documents/Invoices Unavailable"
            subtitle={documentsInvoicesErrorMessage}
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
                  disabled={isOpeningPermitReport || !canPerform('/permitReport')}
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
                  onClick={() => void onOpenInvoiceUpload()}
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
                title="Action Info"
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
                { label: 'Remarks', value: displayValue(detail.remarks) },
              ]}
            />
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Permit Items <Tag type="green">API</Tag>
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
              <div className="legacy-search-grid">
                <TextInput
                  id="permitInvoiceDraftNumber"
                  labelText="Invoice Number"
                  value={invoiceDraftNumber}
                  invalid={!!invoiceFieldError('invoiceDraftNumber')}
                  invalidText={invoiceFieldError('invoiceDraftNumber')}
                  onBlur={() => markInvoiceFieldTouched('invoiceDraftNumber')}
                  onChange={(event) => setInvoiceDraftNumber(event.target.value)}
                  placeholder="Enter sales invoice number"
                />
                <TextInput
                  id="permitInvoiceDraftExportValue"
                  labelText="Export Value"
                  value={invoiceDraftExportValue}
                  invalid={!!invoiceFieldError('invoiceDraftExportValue')}
                  invalidText={invoiceFieldError('invoiceDraftExportValue')}
                  onBlur={() => markInvoiceFieldTouched('invoiceDraftExportValue')}
                  onChange={(event) => setInvoiceDraftExportValue(event.target.value)}
                  placeholder="Enter export value"
                />
                <TextInput
                  id="permitInvoiceDraftFeeInLieu"
                  labelText="Fee In Lieu"
                  value={invoiceDraftFeeInLieu}
                  invalid={!!invoiceFieldError('invoiceDraftFeeInLieu')}
                  invalidText={invoiceFieldError('invoiceDraftFeeInLieu')}
                  onBlur={() => markInvoiceFieldTouched('invoiceDraftFeeInLieu')}
                  onChange={(event) => setInvoiceDraftFeeInLieu(event.target.value)}
                  placeholder="Enter fee in lieu (defaults to export value)"
                />
              </div>
              <div className="legacy-search-actions">
                <Button
                  kind="secondary"
                  size="sm"
                  disabled={!canDeleteInvoiceDocuments || isAddingInvoice || !detail.permitNumber}
                  onClick={() => void onAddInvoice()}
                >
                  {isAddingInvoice ? 'Adding Invoice...' : 'Add Invoice'}
                </Button>
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Fee Ledger <Tag type="green">API</Tag>
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
                GBMS Events <Tag type="green">API</Tag>
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
                OIC Items <Tag type="green">API</Tag>
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
                BOIC Items <Tag type="green">API</Tag>
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

          <Column sm={4} md={8} lg={16}>
            <Tile>
              <h2 className="detail-tile-title">
                Permit Documents <Tag type="green">API</Tag>
              </h2>
              {canDeletePermitDocuments && (
                <DetailDocumentUploadPanel
                  workflowType="permit"
                  targetNumber={String(detail.permitNumber ?? permitNumber ?? '')}
                  inputId="permitDocumentUpload"
                  disabled={!detail.permitNumber}
                  onUploadComplete={refreshPermitDocuments}
                />
              )}
              <TextInput
                id="permitDocumentsFilter"
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
                  {filteredDocumentRows.map((row) => {
                    const invoiceDocument = isInvoiceDocumentRow(row)
                    const canDeleteRow =
                      canDeletePermitDocuments && (!invoiceDocument || canDeleteInvoiceDocuments)
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell>{row.description || '-'}</TableCell>
                        <TableCell>{row.type || row.typeCode || '-'}</TableCell>
                        <TableCell>
                          <div className="legacy-search-actions">
                            <Button
                              kind="ghost"
                              size="sm"
                              disabled={!canPerform('/permitDetails')}
                              onClick={() => void onOpenDocument(row)}
                            >
                              Open
                            </Button>
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              disabled={!canDeleteRow || isRemovingDocumentId === row.id}
                              onClick={() => void onRemoveDocument(row)}
                            >
                              {isRemovingDocumentId === row.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
              <h2 className="detail-tile-title">
                Invoices <Tag type="green">API</Tag>
              </h2>
              <TextInput
                id="permitInvoicesFilter"
                labelText="Filter invoice rows"
                value={invoicesFilter}
                onChange={(event) => updateFilterParam('invoicesFilter', event.target.value)}
                placeholder="Filter by invoice number, value, rate, or fee-in-lieu"
              />
              <Table useZebraStyles>
                <TableHead>
                  <TableRow>
                    <TableHeader>Invoice Number</TableHeader>
                    <TableHeader>Export Value (CAD)</TableHeader>
                    <TableHeader>Conversion Rate</TableHeader>
                    <TableHeader>Fee In Lieu</TableHeader>
                    <TableHeader>Status</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoiceRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.invoiceNumber || '-'}</TableCell>
                      <TableCell>{row.exportValueCad || '-'}</TableCell>
                      <TableCell>{row.conversionRate || '-'}</TableCell>
                      <TableCell>{row.feeInLieu || '-'}</TableCell>
                      <TableCell>{row.invoiceFound ? 'Found' : 'Missing'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredInvoiceRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>No invoice rows matched the current filter.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={8}>
            <DetailFieldTile
              title="Tab Data Sources"
              fields={[
                { label: 'Items', value: 'API' },
                { label: 'Fees', value: 'API' },
                { label: 'GBMS Events', value: 'API' },
                { label: 'OIC Items', value: 'API' },
                { label: 'BOIC Items', value: 'API' },
                { label: 'Documents', value: 'API' },
                { label: 'Invoices', value: 'API' },
              ]}
            />
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialPermitDetailsPage
