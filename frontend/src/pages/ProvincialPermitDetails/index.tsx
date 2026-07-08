import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import { AppNotification } from '../../components/AppNotification'
import DetailDocumentUploadPanel from '../../components/uploads/DetailDocumentUploadPanel'
import type { ProvincialPermitDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue, matchesFilter } from '@/pages/shared/detail-page-utils'
import { searchParamsWithValue } from '@/pages/shared/search-query-utils'
import {
  firstValidationError,
  getVisibleFieldError,
  integerFieldError,
  isoDateFieldError,
  numericFieldError,
  requiredFieldError,
  requiredMaxLengthFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialPermitDetail } from '@/service/lexis-detail-service'
import {
  fetchApplicationClientData,
  type ApplicationClientData,
} from '@/service/application-client-lookup-service'
import {
  addPermitInvoice,
  fetchPermitDocuments,
  fetchPermitInvoiceConversionRate,
  fetchPermitInvoices,
  openPermitDocument,
  removePermitApplicationDocument,
  removePermitDocument,
  removePermitInvoiceDocument,
  updatePermitDetail,
  updatePermitShipping,
  type PermitDocumentRow,
  type PermitDetailMutationRequest,
  type PermitInvoiceRow,
} from '@/service/provincial-permit-documents-invoices-service'
import {
  EMPTY_PROVINCIAL_PERMIT_DETAIL_TABS,
  fetchProvincialPermitDetailTabs,
  type ProvincialPermitDetailTabsData,
} from '@/service/provincial-permit-detail-tabs-service'
import { ReportRequestError, runReport } from '@/service/report-service'
import { openBlobInNewTab, triggerBrowserDownload } from '@/utils/download'

const formatAmount = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

const MAX_SALES_INVOICE_NUMBER_LENGTH = 9
const PERMIT_DETAIL_TAB_INDEX = {
  permit: 0,
  owner: 1,
  agent: 2,
  shipping: 3,
  items: 4,
  fees: 5,
  gbms: 6,
  orders: 7,
  documents: 8,
  invoices: 9,
} as const

const fetchPermitClientData = (
  clientNumber: string | null,
  clientLocationCode: string | null,
): Promise<ApplicationClientData | null> => {
  if (!clientNumber || !clientLocationCode) {
    return Promise.resolve(null)
  }

  return fetchApplicationClientData(clientNumber, clientLocationCode)
}

type PermitClientTileProps = {
  title: string
  clientNumber: string | null
  locationCode: string | null
  clientData: ApplicationClientData | null
  isLoading: boolean
}

const PermitClientTile = ({
  title,
  clientNumber,
  locationCode,
  clientData,
  isLoading,
}: PermitClientTileProps) => (
  <DetailFieldTile
    title={title}
    fields={[
      { label: 'Client number', value: displayValue(clientNumber) },
      { label: 'Location', value: displayValue(locationCode) },
      {
        label: 'Company name',
        value: isLoading ? 'Loading...' : displayValue(clientData?.companyName),
      },
      { label: 'Address', value: isLoading ? 'Loading...' : displayValue(clientData?.address) },
      { label: 'City', value: isLoading ? 'Loading...' : displayValue(clientData?.city) },
      { label: 'Province', value: isLoading ? 'Loading...' : displayValue(clientData?.province) },
      {
        label: 'Postal code',
        value: isLoading ? 'Loading...' : displayValue(clientData?.postalCode),
      },
      { label: 'Country', value: isLoading ? 'Loading...' : displayValue(clientData?.country) },
      { label: 'Phone', value: isLoading ? 'Loading...' : displayValue(clientData?.phone) },
      { label: 'Fax', value: isLoading ? 'Loading...' : displayValue(clientData?.fax) },
      { label: 'Email', value: isLoading ? 'Loading...' : displayValue(clientData?.email) },
    ]}
  />
)

type PermitDetailFormField =
  | 'permitNumber'
  | 'permitStatus'
  | 'permitIssueDate'
  | 'permitExpiryDate'
  | 'permitRequestDate'
  | 'exemptionNumber'
  | 'permitReceiptNo'
  | 'permitRemarks'
  | 'permitTotalVolume'
  | 'permitNumberOfPieces'
  | 'region'
  | 'ownerClientNumber'
  | 'ownerClientLocation'
  | 'agentClientNumber'
  | 'agentClientLocation'
  | 'destinationCompanyName'
  | 'destinationCountry'
  | 'transportType'
  | 'transportName'
  | 'estimatedShippingDate'
  | 'portOfExport'
  | 'otherPortOfExport'

type PermitDetailForm = Record<PermitDetailFormField, string>

const detailValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const numericDetailValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value)

const optionalNumberValue = (value: string): number | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

const optionalIntegerValue = (value: string): number | null => {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedValue = Number(normalizedValue)
  return Number.isInteger(parsedValue) ? parsedValue : null
}

const buildPermitDetailForm = (permitDetail: ProvincialPermitDetail): PermitDetailForm => ({
  permitNumber: detailValue(permitDetail.permitNumber),
  permitStatus: detailValue(permitDetail.permitStatusCode),
  permitIssueDate: detailValue(permitDetail.issueDate),
  permitExpiryDate: detailValue(permitDetail.expiryDate),
  permitRequestDate: detailValue(permitDetail.receivedDate),
  exemptionNumber: detailValue(permitDetail.exemptionNumber),
  permitReceiptNo: detailValue(permitDetail.receiptNumber),
  permitRemarks: detailValue(permitDetail.remarks),
  permitTotalVolume: numericDetailValue(permitDetail.permitVolume),
  permitNumberOfPieces: numericDetailValue(permitDetail.numberOfPieces),
  region: detailValue(permitDetail.region),
  ownerClientNumber: detailValue(permitDetail.ownerClientNumber),
  ownerClientLocation: detailValue(permitDetail.ownerClientLocationCode),
  agentClientNumber: detailValue(permitDetail.applicantClientNumber),
  agentClientLocation: detailValue(permitDetail.agentClientLocationCode),
  destinationCompanyName: detailValue(permitDetail.destinationCompanyName),
  destinationCountry: detailValue(permitDetail.destinationCountryCode),
  transportType: detailValue(permitDetail.transportTypeCode),
  transportName: detailValue(permitDetail.transportName),
  estimatedShippingDate: detailValue(permitDetail.estimatedShippingDate),
  portOfExport: detailValue(permitDetail.portOfExportCode),
  otherPortOfExport: detailValue(permitDetail.otherPortOfExport),
})

const withUpdatedPermitDetail = (
  currentDetail: ProvincialPermitDetail,
  form: PermitDetailForm,
): ProvincialPermitDetail => ({
  ...currentDetail,
  permitNumber: optionalIntegerValue(form.permitNumber),
  permitStatusCode: form.permitStatus.trim() || null,
  permitStatusDescription:
    form.permitStatus.trim() === detailValue(currentDetail.permitStatusCode)
      ? currentDetail.permitStatusDescription
      : form.permitStatus.trim() || null,
  exemptionNumber: form.exemptionNumber.trim() || null,
  issueDate: form.permitIssueDate.trim() || null,
  expiryDate: form.permitExpiryDate.trim() || null,
  receivedDate: form.permitRequestDate.trim() || null,
  permitVolume: optionalNumberValue(form.permitTotalVolume),
  numberOfPieces: optionalIntegerValue(form.permitNumberOfPieces),
  receiptNumber: form.permitReceiptNo.trim() || null,
  remarks: form.permitRemarks.trim() || null,
  region: form.region.trim() || null,
  ownerClientNumber: form.ownerClientNumber.trim() || null,
  ownerClientLocationCode: form.ownerClientLocation.trim() || null,
  applicantClientNumber: form.agentClientNumber.trim() || null,
  agentClientLocationCode: form.agentClientLocation.trim() || null,
})

const withUpdatedPermitShipping = (
  currentDetail: ProvincialPermitDetail,
  form: PermitDetailForm,
): ProvincialPermitDetail => ({
  ...currentDetail,
  destinationCompanyName: form.destinationCompanyName.trim() || null,
  destinationCountryCode: form.destinationCountry.trim() || null,
  transportTypeCode: form.transportType.trim() || null,
  transportName: form.transportName.trim() || null,
  portOfExportCode: form.portOfExport.trim() || null,
  otherPortOfExport: form.otherPortOfExport.trim() || null,
  estimatedShippingDate: form.estimatedShippingDate.trim() || null,
})

const ProvincialPermitDetailsPage = () => {
  const { canPerform } = useAuth()
  const { permitNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialPermitDetail | null>(null)
  const [tabsData, setTabsData] = useState<ProvincialPermitDetailTabsData | null>(null)
  const [ownerClientData, setOwnerClientData] = useState<ApplicationClientData | null>(null)
  const [agentClientData, setAgentClientData] = useState<ApplicationClientData | null>(null)
  const [isClientDataLoading, setIsClientDataLoading] = useState(false)
  const [documentRows, setDocumentRows] = useState<PermitDocumentRow[]>([])
  const [invoiceRows, setInvoiceRows] = useState<PermitInvoiceRow[]>([])
  const [permitForm, setPermitForm] = useState<PermitDetailForm | null>(null)
  const [isEditingPermit, setIsEditingPermit] = useState(false)
  const [isEditingShipping, setIsEditingShipping] = useState(false)
  const [isSavingPermit, setIsSavingPermit] = useState(false)
  const [isSavingShipping, setIsSavingShipping] = useState(false)
  const [isOpeningPermitReport, setIsOpeningPermitReport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsInvoicesErrorMessage, setDocumentsInvoicesErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [invoiceDraftNumber, setInvoiceDraftNumber] = useState('')
  const [invoiceDraftExportValue, setInvoiceDraftExportValue] = useState('')
  const [invoiceDraftFeeInLieu, setInvoiceDraftFeeInLieu] = useState('')
  const [isAddingInvoice, setIsAddingInvoice] = useState(false)
  const [selectedPermitTabIndex, setSelectedPermitTabIndex] = useState(
    PERMIT_DETAIL_TAB_INDEX.permit,
  )
  const [touchedInvoiceFields, setTouchedInvoiceFields] = useState<
    TouchedFields<PermitInvoiceField>
  >({})
  const [touchedPermitFields, setTouchedPermitFields] = useState<
    TouchedFields<PermitDetailFormField>
  >({})
  const [showInvoiceValidationErrors, setShowInvoiceValidationErrors] = useState(false)
  const [showPermitValidationErrors, setShowPermitValidationErrors] = useState(false)
  const beginDetailRequest = useLatestRequestGuard()
  const beginDocumentRefreshRequest = useLatestRequestGuard()
  const beginAddInvoiceRequest = useLatestRequestGuard()
  const beginPermitMutationRequest = useLatestRequestGuard()
  const itemsFilter = searchParams.get('itemsFilter') ?? ''
  const feesFilter = searchParams.get('feesFilter') ?? ''
  const gbmsFilter = searchParams.get('gbmsFilter') ?? ''
  const oicFilter = searchParams.get('oicFilter') ?? ''
  const boicFilter = searchParams.get('boicFilter') ?? ''
  const documentsFilter = searchParams.get('documentsFilter') ?? ''
  const invoicesFilter = searchParams.get('invoicesFilter') ?? ''
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
      const nextSearchParams = searchParamsWithValue(searchParams, key, value)

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
        setPermitForm(null)
        setIsEditingPermit(false)
        setIsEditingShipping(false)
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
        setPermitForm(response ? buildPermitDetailForm(response) : null)
        setIsEditingPermit(false)
        setIsEditingShipping(false)

        if (!response) {
          setErrorMessage(`No provincial permit found for ${permitNumber}.`)
          setPermitForm(null)
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
          setPermitForm(null)
          setIsEditingPermit(false)
          setIsEditingShipping(false)
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

  useEffect(() => {
    let isCancelled = false

    const loadClientData = async () => {
      setOwnerClientData(null)
      setAgentClientData(null)

      if (!detail) {
        setIsClientDataLoading(false)
        return
      }

      const ownerClientNumber = detail.ownerClientNumber
      const ownerClientLocationCode = detail.ownerClientLocationCode
      const agentClientNumber = detail.applicantClientNumber
      const agentClientLocationCode = detail.agentClientLocationCode
      const hasClientLookup =
        (!!ownerClientNumber && !!ownerClientLocationCode) ||
        (!!agentClientNumber && !!agentClientLocationCode)

      if (!hasClientLookup) {
        setIsClientDataLoading(false)
        return
      }

      setIsClientDataLoading(true)
      try {
        const [ownerResult, agentResult] = await Promise.all([
          fetchPermitClientData(ownerClientNumber, ownerClientLocationCode),
          fetchPermitClientData(agentClientNumber, agentClientLocationCode),
        ])
        if (!isCancelled) {
          setOwnerClientData(ownerResult)
          setAgentClientData(agentResult)
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('Unable to load permit owner or agent client data.', error)
        }
      } finally {
        if (!isCancelled) {
          setIsClientDataLoading(false)
        }
      }
    }

    void loadClientData()

    return () => {
      isCancelled = true
    }
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
  const canSavePermit = canPerform('savePermit')
  const canOpenPermitReport =
    canPerform('/permitReport') && detail?.permitStatusCode?.trim().toUpperCase() === 'COM'
  const permitFieldErrors = useMemo<FieldErrors<PermitDetailFormField>>(() => {
    if (!permitForm) {
      return {}
    }

    return {
      permitNumber: requiredFieldError(permitForm.permitNumber, 'Permit number') ?? undefined,
      permitStatus: requiredFieldError(permitForm.permitStatus, 'Permit status') ?? undefined,
      permitIssueDate: isoDateFieldError(permitForm.permitIssueDate) ?? undefined,
      permitExpiryDate: isoDateFieldError(permitForm.permitExpiryDate) ?? undefined,
      permitRequestDate: isoDateFieldError(permitForm.permitRequestDate) ?? undefined,
      estimatedShippingDate: isoDateFieldError(permitForm.estimatedShippingDate) ?? undefined,
      permitTotalVolume:
        numericFieldError(permitForm.permitTotalVolume, 'Permit volume') ?? undefined,
      permitNumberOfPieces: permitForm.permitNumberOfPieces.trim()
        ? (integerFieldError(permitForm.permitNumberOfPieces, 'Number of pieces') ?? undefined)
        : undefined,
    }
  }, [permitForm])
  const hasPermitValidationError = Object.values(permitFieldErrors).some((error) => !!error)
  const invoiceFieldErrors = useMemo<FieldErrors<PermitInvoiceField>>(
    () => ({
      invoiceDraftNumber:
        requiredMaxLengthFieldError(
          invoiceDraftNumber,
          MAX_SALES_INVOICE_NUMBER_LENGTH,
          'Invoice number',
        ) ?? undefined,
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

  const markPermitFieldTouched = (field: PermitDetailFormField): void => {
    setTouchedPermitFields((current) => ({ ...current, [field]: true }))
  }

  const permitFieldError = (field: PermitDetailFormField): string | undefined =>
    getVisibleFieldError(field, permitFieldErrors, touchedPermitFields, showPermitValidationErrors)

  const setPermitFormField = (field: PermitDetailFormField, value: string): void => {
    setPermitForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const resetPermitForm = (): void => {
    if (detail) {
      setPermitForm(buildPermitDetailForm(detail))
    }
    setTouchedPermitFields({})
    setShowPermitValidationErrors(false)
  }

  const onSavePermit = useCallback(async () => {
    const request: PermitDetailMutationRequest | null = permitForm
    if (!detail || !request || !canSavePermit) {
      return
    }

    if (hasPermitValidationError) {
      setShowPermitValidationErrors(true)
      setActionErrorMessage(
        Object.values(permitFieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before saving the permit.',
      )
      return
    }

    const isLatestRequest = beginPermitMutationRequest()
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingPermit(true)
    try {
      const result = await updatePermitDetail(request)
      if (!isLatestRequest()) {
        return
      }
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || result.message || 'Unable to save permit.')
        return
      }

      const updatedDetail = withUpdatedPermitDetail(detail, request)
      setDetail(updatedDetail)
      setPermitForm(buildPermitDetailForm(updatedDetail))
      setIsEditingPermit(false)
      setTouchedPermitFields({})
      setShowPermitValidationErrors(false)
      setActionInfoMessage(result.message || 'Permit saved successfully.')
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to save permit.')
      }
    } finally {
      if (isLatestRequest()) {
        setIsSavingPermit(false)
      }
    }
  }, [
    beginPermitMutationRequest,
    canSavePermit,
    detail,
    hasPermitValidationError,
    permitFieldErrors,
    permitForm,
  ])

  const onSaveShipping = useCallback(async () => {
    const request: PermitDetailMutationRequest | null = permitForm
    if (!detail || !request || !canSavePermit) {
      return
    }

    if (hasPermitValidationError) {
      setShowPermitValidationErrors(true)
      setActionErrorMessage(
        Object.values(permitFieldErrors).find((error): error is string => !!error) ??
          'Please fix validation errors before saving shipping.',
      )
      return
    }

    const isLatestRequest = beginPermitMutationRequest()
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingShipping(true)
    try {
      const result = await updatePermitShipping(request)
      if (!isLatestRequest()) {
        return
      }
      if (!result.success) {
        setActionErrorMessage(result.errors[0] || result.message || 'Unable to save shipping.')
        return
      }

      const updatedDetail = withUpdatedPermitShipping(detail, request)
      setDetail(updatedDetail)
      setPermitForm(buildPermitDetailForm(updatedDetail))
      setIsEditingShipping(false)
      setTouchedPermitFields({})
      setShowPermitValidationErrors(false)
      setActionInfoMessage(result.message || 'Shipping saved successfully.')
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setActionErrorMessage('Unable to save shipping.')
      }
    } finally {
      if (isLatestRequest()) {
        setIsSavingShipping(false)
      }
    }
  }, [
    beginPermitMutationRequest,
    canSavePermit,
    detail,
    hasPermitValidationError,
    permitFieldErrors,
    permitForm,
  ])

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

  const onOpenPermitReport = useCallback(async () => {
    const resolvedPermitNumber = String(detail?.permitNumber ?? permitNumber ?? '').trim()
    if (!resolvedPermitNumber || !canOpenPermitReport) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsOpeningPermitReport(true)
    try {
      const result = await runReport({
        reportId: 'permitReport',
        actionMapping: 'generate',
        values: { permitNumber: resolvedPermitNumber },
      })
      const opened = openBlobInNewTab(result.blob, 'Permit')
      if (!opened) {
        triggerBrowserDownload(result.blob, result.filename)
        setActionInfoMessage(
          'Popup blocked while opening permit report. Downloaded the report instead.',
        )
      }
    } catch (error) {
      console.error(error)
      setActionErrorMessage(
        error instanceof ReportRequestError ? error.message : 'Unable to generate permit report.',
      )
    } finally {
      setIsOpeningPermitReport(false)
    }
  }, [canOpenPermitReport, detail?.permitNumber, permitNumber])

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

  const renderPermitTextInput = (
    field: PermitDetailFormField,
    labelText: string,
    isDisabled: boolean,
  ) => (
    <TextInput
      id={`permit-${field}`}
      labelText={labelText}
      value={permitForm?.[field] ?? ''}
      invalid={!!permitFieldError(field)}
      invalidText={permitFieldError(field)}
      onBlur={() => markPermitFieldTouched(field)}
      onChange={(event) => setPermitFormField(field, event.target.value)}
      disabled={isDisabled}
    />
  )

  const renderPermitTextArea = (
    field: PermitDetailFormField,
    labelText: string,
    isDisabled: boolean,
  ) => (
    <TextArea
      id={`permit-${field}`}
      labelText={labelText}
      value={permitForm?.[field] ?? ''}
      invalid={!!permitFieldError(field)}
      invalidText={permitFieldError(field)}
      onBlur={() => markPermitFieldTouched(field)}
      onChange={(event) => setPermitFormField(field, event.target.value)}
      disabled={isDisabled}
      rows={3}
    />
  )

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <div className="application-detail-title-row">
          <div>
            <h1>Provincial permit details</h1>
            <p>
              Permit <code>{permitNumber}</code>
            </p>
          </div>
          {detail && (
            <dl className="application-detail-header-metrics" aria-label="Permit highlights">
              <div>
                <dt>Status</dt>
                <dd>{displayValue(detail.permitStatusDescription ?? detail.permitStatusCode)}</dd>
              </div>
              <div>
                <dt>Application</dt>
                <dd>{displayValue(detail.applicationNumber)}</dd>
              </div>
              <div>
                <dt>Exemption</dt>
                <dd>{displayValue(detail.exemptionNumber)}</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>{documentRows.length.toLocaleString()}</dd>
              </div>
            </dl>
          )}
          {canOpenPermitReport && (
            <Button
              kind="primary"
              size="sm"
              disabled={isOpeningPermitReport}
              onClick={() => void onOpenPermitReport()}
            >
              {isOpeningPermitReport ? 'Opening...' : 'Print permit'}
            </Button>
          )}
        </div>
      </Column>

      {loading && (
        <Column sm={4} md={8} lg={16}>
          <InlineLoading description="Loading provincial permit detail..." />
        </Column>
      )}

      {!loading && !!errorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="error"
            title="Detail unavailable"
            subtitle={errorMessage}
            lowContrast
            onCloseButtonClick={() => setErrorMessage('')}
          />
        </Column>
      )}

      {!loading && !!documentsInvoicesErrorMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <AppNotification
            kind="warning"
            title="Documents/invoices unavailable"
            subtitle={documentsInvoicesErrorMessage}
            lowContrast
            onCloseButtonClick={() => setDocumentsInvoicesErrorMessage('')}
          />
        </Column>
      )}

      {!loading && detail && (
        <>
          {!!actionInfoMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="info"
                title="Action info"
                subtitle={actionInfoMessage}
                lowContrast
                onCloseButtonClick={() => setActionInfoMessage('')}
              />
            </Column>
          )}

          {!!actionErrorMessage && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <AppNotification
                kind="error"
                title="Action failed"
                subtitle={actionErrorMessage}
                lowContrast
                onCloseButtonClick={() => setActionErrorMessage('')}
              />
            </Column>
          )}

          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <Tabs
              selectedIndex={selectedPermitTabIndex}
              onChange={({ selectedIndex }) => setSelectedPermitTabIndex(selectedIndex)}
            >
              <TabList
                aria-label="Permit detail sections"
                contained
                size="md"
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Permit</Tab>
                <Tab>Owner</Tab>
                <Tab>Agent</Tab>
                <Tab>Shipping</Tab>
                <Tab>Items</Tab>
                <Tab>Fees</Tab>
                <Tab>GBMS</Tab>
                <Tab>Orders</Tab>
                <Tab>Documents</Tab>
                <Tab>Invoices</Tab>
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingPermit && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Permit summary</h2>
                          <div className="legacy-search-grid">
                            {renderPermitTextInput('permitNumber', 'Permit number', true)}
                            <TextInput
                              id="permit-applicationNumber"
                              labelText="Application number"
                              value={displayValue(detail.applicationNumber)}
                              disabled
                            />
                            <TextInput
                              id="permit-packageNumber"
                              labelText="Package number"
                              value={displayValue(detail.packageNumber)}
                              disabled
                            />
                            {renderPermitTextInput('exemptionNumber', 'Exemption number', false)}
                            {renderPermitTextInput('permitStatus', 'Permit status', false)}
                            {renderPermitTextInput('permitIssueDate', 'Issue date', false)}
                            {renderPermitTextInput('permitExpiryDate', 'Expiry date', false)}
                            {renderPermitTextInput('permitRequestDate', 'Received date', false)}
                            {renderPermitTextInput('region', 'Region', false)}
                          </div>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title="Permit summary"
                          fields={[
                            { label: 'Permit number', value: displayValue(detail.permitNumber) },
                            {
                              label: 'Application number',
                              value: displayValue(detail.applicationNumber),
                            },
                            { label: 'Package number', value: displayValue(detail.packageNumber) },
                            {
                              label: 'Exemption number',
                              value: displayValue(detail.exemptionNumber),
                            },
                            {
                              label: 'Status',
                              value: displayValue(
                                detail.permitStatusDescription ?? detail.permitStatusCode,
                              ),
                            },
                            { label: 'Issue date', value: displayValue(detail.issueDate) },
                            { label: 'Expiry date', value: displayValue(detail.expiryDate) },
                            { label: 'Received date', value: displayValue(detail.receivedDate) },
                            { label: 'Region', value: displayValue(detail.region) },
                          ]}
                        />
                      )}
                    </Column>

                    <Column sm={4} md={8} lg={16}>
                      {isEditingPermit && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Financial and volume</h2>
                          <div className="legacy-search-grid">
                            <TextInput
                              id="permit-approvedExemptionVolume"
                              labelText="Total exemption volume (m³)"
                              value={displayValue(detail.approvedExemptionVolume)}
                              disabled
                            />
                            <TextInput
                              id="permit-exemptionVolumeRemaining"
                              labelText="Total volume remaining (m³)"
                              value={displayValue(detail.exemptionVolumeRemaining)}
                              disabled
                            />
                            {renderPermitTextInput(
                              'permitTotalVolume',
                              'Permit volume (m³)',
                              false,
                            )}
                            {renderPermitTextInput(
                              'permitNumberOfPieces',
                              'Number of pieces',
                              false,
                            )}
                            {renderPermitTextInput('permitReceiptNo', 'Receipt number', false)}
                            <TextInput
                              id="permit-invoiceNumber"
                              labelText="Invoice number"
                              value={displayValue(detail.invoiceNumber)}
                              disabled
                            />
                            <TextInput
                              id="permit-federalPermitNumber"
                              labelText="Federal permit number"
                              value={displayValue(detail.federalPermitNumber)}
                              disabled
                            />
                            {renderPermitTextInput(
                              'agentClientNumber',
                              'Agent client number',
                              false,
                            )}
                            {renderPermitTextInput('agentClientLocation', 'Agent location', false)}
                            {renderPermitTextInput(
                              'ownerClientNumber',
                              'Owner client number',
                              false,
                            )}
                            {renderPermitTextInput('ownerClientLocation', 'Owner location', false)}
                          </div>
                          <div className="legacy-search-grid">
                            {renderPermitTextArea('permitRemarks', 'Remarks', false)}
                          </div>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title="Financial and volume"
                          fields={[
                            {
                              label: 'Total exemption volume (m³)',
                              value: displayValue(detail.approvedExemptionVolume),
                            },
                            {
                              label: 'Total volume remaining (m³)',
                              value: displayValue(detail.exemptionVolumeRemaining),
                            },
                            {
                              label: 'Permit volume (m³)',
                              value: displayValue(detail.permitVolume),
                            },
                            {
                              label: 'Number of pieces',
                              value: displayValue(detail.numberOfPieces),
                            },
                            { label: 'Receipt number', value: displayValue(detail.receiptNumber) },
                            { label: 'Invoice number', value: displayValue(detail.invoiceNumber) },
                            {
                              label: 'Federal permit number',
                              value: displayValue(detail.federalPermitNumber),
                            },
                            {
                              label: 'Agent client number',
                              value: displayValue(detail.applicantClientNumber),
                            },
                            {
                              label: 'Agent location',
                              value: displayValue(detail.agentClientLocationCode),
                            },
                            {
                              label: 'Owner client number',
                              value: displayValue(detail.ownerClientNumber),
                            },
                            {
                              label: 'Owner location',
                              value: displayValue(detail.ownerClientLocationCode),
                            },
                            { label: 'Remarks', value: displayValue(detail.remarks) },
                          ]}
                        />
                      )}
                    </Column>
                    {canSavePermit && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingPermit ? (
                            <>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={isSavingPermit}
                                onClick={() => void onSavePermit()}
                              >
                                {isSavingPermit ? 'Saving...' : 'Save permit'}
                              </Button>
                              <Button
                                kind="secondary"
                                size="sm"
                                disabled={isSavingPermit}
                                onClick={() => {
                                  resetPermitForm()
                                  setIsEditingPermit(false)
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              kind="secondary"
                              size="sm"
                              onClick={() => {
                                resetPermitForm()
                                setIsEditingPermit(true)
                              }}
                            >
                              Edit permit
                            </Button>
                          )}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <PermitClientTile
                        title="Owner"
                        clientNumber={detail.ownerClientNumber}
                        locationCode={detail.ownerClientLocationCode}
                        clientData={ownerClientData}
                        isLoading={isClientDataLoading}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <PermitClientTile
                        title="Agent"
                        clientNumber={detail.applicantClientNumber}
                        locationCode={detail.agentClientLocationCode}
                        clientData={agentClientData}
                        isLoading={isClientDataLoading}
                      />
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      {isEditingShipping && permitForm ? (
                        <Tile>
                          <h2 className="detail-tile-title">Shipping</h2>
                          <div className="legacy-search-grid">
                            {renderPermitTextInput(
                              'destinationCompanyName',
                              'Destination company',
                              false,
                            )}
                            {renderPermitTextInput(
                              'destinationCountry',
                              'Destination country',
                              false,
                            )}
                            {renderPermitTextInput('transportType', 'Transport type', false)}
                            {renderPermitTextInput('transportName', 'Transport name', false)}
                            {renderPermitTextInput('portOfExport', 'Port of export', false)}
                            {renderPermitTextInput(
                              'otherPortOfExport',
                              'Other port of export',
                              false,
                            )}
                            {renderPermitTextInput(
                              'estimatedShippingDate',
                              'Estimated shipping date',
                              false,
                            )}
                          </div>
                        </Tile>
                      ) : (
                        <DetailFieldTile
                          title="Shipping"
                          fields={[
                            {
                              label: 'Destination company',
                              value: displayValue(detail.destinationCompanyName),
                            },
                            {
                              label: 'Destination country',
                              value: displayValue(detail.destinationCountryCode),
                            },
                            {
                              label: 'Transport type',
                              value: displayValue(detail.transportTypeCode),
                            },
                            { label: 'Transport name', value: displayValue(detail.transportName) },
                            {
                              label: 'Port of export',
                              value: displayValue(detail.portOfExportCode),
                            },
                            {
                              label: 'Other port of export',
                              value: displayValue(detail.otherPortOfExport),
                            },
                            {
                              label: 'Estimated shipping date',
                              value: displayValue(detail.estimatedShippingDate),
                            },
                          ]}
                        />
                      )}
                    </Column>
                    {canSavePermit && (
                      <Column sm={4} md={8} lg={16}>
                        <div className="legacy-search-actions">
                          {isEditingShipping ? (
                            <>
                              <Button
                                kind="primary"
                                size="sm"
                                disabled={isSavingShipping}
                                onClick={() => void onSaveShipping()}
                              >
                                {isSavingShipping ? 'Saving...' : 'Save shipping'}
                              </Button>
                              <Button
                                kind="secondary"
                                size="sm"
                                disabled={isSavingShipping}
                                onClick={() => {
                                  resetPermitForm()
                                  setIsEditingShipping(false)
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              kind="secondary"
                              size="sm"
                              onClick={() => {
                                resetPermitForm()
                                setIsEditingShipping(true)
                              }}
                            >
                              Edit shipping
                            </Button>
                          )}
                        </div>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Permit items</h2>
                        <fieldset className="legacy-form-fieldset">
                          <legend>Package details</legend>
                          <Table useZebraStyles>
                            <TableHead>
                              <TableRow>
                                <TableHeader>Package number</TableHeader>
                                <TableHeader>Region</TableHeader>
                                <TableHeader>Species and end use sort</TableHeader>
                                <TableHeader>Age class</TableHeader>
                                <TableHeader>Package volume (m³)</TableHeader>
                                <TableHeader>Average length</TableHeader>
                                <TableHeader>Average top diameter</TableHeader>
                                <TableHeader>Product type</TableHeader>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(tabsData?.packages ?? []).map((row) => (
                                <TableRow key={row.packageNumber}>
                                  <TableCell>{row.packageNumber || '-'}</TableCell>
                                  <TableCell>{row.region || '-'}</TableCell>
                                  <TableCell style={{ whiteSpace: 'pre-line' }}>
                                    {row.speciesEndUseSort || '-'}
                                  </TableCell>
                                  <TableCell>{row.ageClass || '-'}</TableCell>
                                  <TableCell>{row.packageVolume || '-'}</TableCell>
                                  <TableCell>{row.averageLength || '-'}</TableCell>
                                  <TableCell>{row.averageTopDiameter || '-'}</TableCell>
                                  <TableCell>{row.productType || '-'}</TableCell>
                                </TableRow>
                              ))}
                              {(tabsData?.packages ?? []).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8}>
                                    No package detail rows are available for this permit.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </fieldset>
                        <fieldset className="legacy-form-fieldset">
                          <legend>Summary of scale</legend>
                          <TextInput
                            id="permitItemsFilter"
                            labelText="Filter item rows"
                            value={itemsFilter}
                            onChange={(event) =>
                              updateFilterParam('itemsFilter', event.target.value)
                            }
                            placeholder="Filter by mark, species, grade, pieces, or volume"
                          />
                          <Table useZebraStyles>
                            <TableHead>
                              <TableRow>
                                <TableHeader>Item</TableHeader>
                                <TableHeader>Timber mark</TableHeader>
                                <TableHeader>Species</TableHeader>
                                <TableHeader>Grade</TableHeader>
                                <TableHeader>Pieces</TableHeader>
                                <TableHeader>Volume (m³)</TableHeader>
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
                        </fieldset>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Fee ledger</h2>
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
                                <TableCell colSpan={6}>
                                  No fee rows matched the current filter.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">
                          General Billing Management System events
                        </h2>
                        <TextInput
                          id="permitGbmsFilter"
                          labelText="Filter General Billing Management System rows"
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
                                <TableCell colSpan={5}>
                                  No billing system rows matched the current filter.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={8}>
                      <Tile>
                        <h2 className="detail-tile-title">Order in Council items</h2>
                        <TextInput
                          id="permitOicFilter"
                          labelText="Filter Order in Council rows"
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
                                <TableCell colSpan={4}>
                                  No Order in Council rows matched the current filter.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>

                    <Column sm={4} md={8} lg={8}>
                      <Tile>
                        <h2 className="detail-tile-title">Blanket Order in Council items</h2>
                        <TextInput
                          id="permitBoicFilter"
                          labelText="Filter Blanket Order in Council rows"
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
                                <TableCell colSpan={4}>
                                  No Blanket Order in Council rows matched the current filter.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Permit documents</h2>
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
                          onChange={(event) =>
                            updateFilterParam('documentsFilter', event.target.value)
                          }
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
                                canDeletePermitDocuments &&
                                (!invoiceDocument || canDeleteInvoiceDocuments)
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
                  </Grid>
                </TabPanel>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Invoices</h2>
                        {canDeleteInvoiceDocuments && (
                          <DetailDocumentUploadPanel
                            workflowType="invoice"
                            targetNumber={String(detail.permitNumber ?? permitNumber ?? '')}
                            inputId="permitInvoiceUpload"
                            disabled={!detail.permitNumber}
                            onUploadComplete={refreshPermitDocuments}
                          />
                        )}
                        <div className="legacy-search-grid">
                          <TextInput
                            id="permitInvoiceDraftNumber"
                            labelText="Invoice number"
                            value={invoiceDraftNumber}
                            invalid={!!invoiceFieldError('invoiceDraftNumber')}
                            invalidText={invoiceFieldError('invoiceDraftNumber')}
                            onBlur={() => markInvoiceFieldTouched('invoiceDraftNumber')}
                            onChange={(event) => setInvoiceDraftNumber(event.target.value)}
                            placeholder="Enter sales invoice number"
                          />
                          <TextInput
                            id="permitInvoiceDraftExportValue"
                            labelText="Export value"
                            value={invoiceDraftExportValue}
                            invalid={!!invoiceFieldError('invoiceDraftExportValue')}
                            invalidText={invoiceFieldError('invoiceDraftExportValue')}
                            onBlur={() => markInvoiceFieldTouched('invoiceDraftExportValue')}
                            onChange={(event) => setInvoiceDraftExportValue(event.target.value)}
                            placeholder="Enter export value"
                          />
                          <TextInput
                            id="permitInvoiceDraftFeeInLieu"
                            labelText="Fee in lieu"
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
                            disabled={
                              !canDeleteInvoiceDocuments || isAddingInvoice || !detail.permitNumber
                            }
                            onClick={() => void onAddInvoice()}
                          >
                            {isAddingInvoice ? 'Adding Invoice...' : 'Add Invoice'}
                          </Button>
                        </div>
                        <TextInput
                          id="permitInvoicesFilter"
                          labelText="Filter invoice rows"
                          value={invoicesFilter}
                          onChange={(event) =>
                            updateFilterParam('invoicesFilter', event.target.value)
                          }
                          placeholder="Filter by invoice number, value, rate, or fee-in-lieu"
                        />
                        <Table useZebraStyles>
                          <TableHead>
                            <TableRow>
                              <TableHeader>Invoice number</TableHeader>
                              <TableHeader>Export value (CAD)</TableHeader>
                              <TableHeader>Conversion Rate</TableHeader>
                              <TableHeader>Fee in lieu</TableHeader>
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
                                <TableCell colSpan={5}>
                                  No invoice rows matched the current filter.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Tile>
                    </Column>
                  </Grid>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Column>
        </>
      )}
    </Grid>
  )
}

export default ProvincialPermitDetailsPage
