import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Column,
  Grid,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
  Tile,
} from '@carbon/react'
import { useAuth } from '@/context/auth/useAuth'
import { AppNotification } from '../../components/AppNotification'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import SearchResultsTableFrame from '@/components/SearchResultsTableFrame'
import {
  firstValidationError,
  greaterThanOrEqualFieldError,
  getVisibleFieldError,
  integerFieldError,
  isoDateFieldError,
  lessThanOrEqualFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import {
  createExportSchedule as createExportScheduleRequest,
  deleteExportSchedule as deleteExportScheduleRequest,
  fetchExportSchedulePage,
  updateExportSchedule as updateExportScheduleRequest,
  type ExportScheduleRow,
  type ExportScheduleSortDirection,
  type ExportScheduleSortField,
} from '@/service/admin-schedule-service'
import {
  deleteFeePolicy as deleteFeePolicyRequest,
  deleteFilPolicy as deleteFilPolicyRequest,
  fetchFeePolicyPage,
  fetchFilPolicyPage,
  type FeePolicyRow,
  type FilPolicyRow,
  upsertFeePolicy as upsertFeePolicyRequest,
  upsertFilPolicy as upsertFilPolicyRequest,
} from '@/service/admin-policy-service'
import { fetchReportOptions, type SearchOption } from '@/service/search-options-service'
import IsoDatePicker from '../../components/IsoDatePicker'
import { getResponseStatus } from '@/utils/http-error'

type PolicyField =
  | 'feeEffectiveDate'
  | 'feeOrgUnitNo'
  | 'feePolicyPercentage'
  | 'filEffectiveDate'
  | 'filPolicyPercentage'
  | 'scheduleAdvertisingDate'
  | 'scheduleApplicationReceiptDate'
  | 'scheduleOfferReceiptDate'
  | 'scheduleOfferEndDate'
  | 'scheduleOfferWithdrawalDate'
  | 'scheduleTeacMeetingDate'

export type AdminPolicyArea = 'fee' | 'fil' | 'schedule'

type AdminPoliciesPageProps = {
  area: AdminPolicyArea
}

const ADMIN_PAGE_SIZES = [20, 50, 100, 200]
const DEFAULT_ADMIN_PAGE_SIZE = 100
const FEE_REGION_OPTIONS_ERROR =
  'Authoritative region options are unavailable. Fee policy saves are disabled.'

const validFeeRegionOptions = (options: SearchOption[]): boolean => {
  if (options.length === 0) {
    return false
  }

  const regionNumbers = options.map((option) => option.value.trim())
  return (
    regionNumbers.every((value) => /^[1-9]\d*$/.test(value)) &&
    options.every((option) => option.label.trim().length > 0) &&
    new Set(regionNumbers).size === regionNumbers.length
  )
}

const boundedIntegerFieldError = (
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string | null => {
  const integerError = integerFieldError(value, label)
  if (integerError) {
    return integerError
  }
  if (!Number.isSafeInteger(Number(value.trim()))) {
    return `${label} must be a whole number.`
  }

  return (
    greaterThanOrEqualFieldError(value, label, minimum) ??
    lessThanOrEqualFieldError(value, label, maximum)
  )
}

const SCHEDULE_SORT_COLUMNS: Array<{ id: ExportScheduleSortField; label: string }> = [
  { id: 'exportScheduleId', label: 'ID' },
  { id: 'advertisingDate', label: 'Advertising date' },
  { id: 'applicationReceiptDate', label: 'Application receipt' },
  { id: 'offerReceiptDate', label: 'Offer receipt' },
  { id: 'offerEndDate', label: 'Offer end' },
  { id: 'offerWithdrawalDate', label: 'Offer withdrawal' },
  { id: 'teacMeetingDate', label: 'TEAC meeting' },
  { id: 'applicationCount', label: 'Applications' },
]

const applicationSearchPathForAdvertisingDate = (advertisingDate: string): string => {
  const searchParams = new URLSearchParams({
    listingFromDate: advertisingDate,
    listingToDate: advertisingDate,
  })
  return `/provincial/application?${searchParams.toString()}`
}

const AdminPoliciesPage = ({ area }: AdminPoliciesPageProps) => {
  const { canPerform } = useAuth()
  const canManageFeePolicy = canPerform('/lexisPolicyAdmin')
  const canManageFilPolicy = canPerform('/lexisFILAdmin')
  const canSearchApplications = canPerform('/applicationSearch')
  const canAccessArea = area === 'fil' ? canManageFilPolicy : canManageFeePolicy

  const [feePolicies, setFeePolicies] = useState<FeePolicyRow[]>([])
  const [filPolicies, setFilPolicies] = useState<FilPolicyRow[]>([])
  const [exportSchedules, setExportSchedules] = useState<ExportScheduleRow[]>([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_ADMIN_PAGE_SIZE)
  const [totalRows, setTotalRows] = useState(0)
  const [scheduleSortField, setScheduleSortField] =
    useState<ExportScheduleSortField>('advertisingDate')
  const [scheduleSortDirection, setScheduleSortDirection] =
    useState<ExportScheduleSortDirection>('desc')

  const [feeEffectiveDate, setFeeEffectiveDate] = useState('')
  const [feeOrgUnitNo, setFeeOrgUnitNo] = useState('')
  const [feePolicyPercentage, setFeePolicyPercentage] = useState('')
  const [editingFeePolicyId, setEditingFeePolicyId] = useState<string | null>(null)
  const [feeRegionOptions, setFeeRegionOptions] = useState<SearchOption[]>([])
  const [feeRegionOptionsError, setFeeRegionOptionsError] = useState('')
  const [isLoadingFeeRegionOptions, setIsLoadingFeeRegionOptions] = useState(
    area === 'fee' && canManageFeePolicy,
  )

  const [filEffectiveDate, setFilEffectiveDate] = useState('')
  const [filPolicyPercentage, setFilPolicyPercentage] = useState('')
  const [editingFilPolicyId, setEditingFilPolicyId] = useState<string | null>(null)

  const [scheduleAdvertisingDate, setScheduleAdvertisingDate] = useState('')
  const [scheduleApplicationReceiptDate, setScheduleApplicationReceiptDate] = useState('')
  const [scheduleOfferReceiptDate, setScheduleOfferReceiptDate] = useState('')
  const [scheduleOfferEndDate, setScheduleOfferEndDate] = useState('')
  const [scheduleOfferWithdrawalDate, setScheduleOfferWithdrawalDate] = useState('')
  const [scheduleTeacMeetingDate, setScheduleTeacMeetingDate] = useState('')
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(true)
  const [isMutatingPolicies, setIsMutatingPolicies] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<PolicyField>>({})
  const [showFeeValidationErrors, setShowFeeValidationErrors] = useState(false)
  const [showFilValidationErrors, setShowFilValidationErrors] = useState(false)
  const [showScheduleValidationErrors, setShowScheduleValidationErrors] = useState(false)

  const pageTitle =
    area === 'fee'
      ? 'Fee policy administration'
      : area === 'fil'
        ? 'Fee in lieu percent policy administration'
        : 'Export schedule administration'
  const pageSubtitle =
    area === 'fee'
      ? 'Manage regional fee policy percentages and effective dates.'
      : area === 'fil'
        ? 'Manage fee-in-lieu percentages and effective dates.'
        : 'Manage advertising, receipt, offer, and TEAC schedule dates.'
  const loadingDescription =
    area === 'schedule'
      ? 'Loading export schedules...'
      : area === 'fil'
        ? 'Loading fee in lieu policies...'
        : 'Loading fee policies...'
  const notificationTitle = area === 'schedule' ? 'Schedule update' : 'Policy update'
  const errorTitle = area === 'schedule' ? 'Schedule error' : 'Policy error'
  const fieldErrors = useMemo<FieldErrors<PolicyField>>(
    () => ({
      feeEffectiveDate:
        firstValidationError(
          () => requiredFieldError(feeEffectiveDate, 'Policy effective date'),
          () => isoDateFieldError(feeEffectiveDate),
        ) ?? undefined,
      feeOrgUnitNo: requiredFieldError(feeOrgUnitNo, 'Region') ?? undefined,
      feePolicyPercentage: firstValidationError(
        () => requiredFieldError(feePolicyPercentage, 'Fee increase percentage'),
        () => boundedIntegerFieldError(feePolicyPercentage, 'Fee increase percentage', 0, 100),
      ),
      filEffectiveDate:
        firstValidationError(
          () => requiredFieldError(filEffectiveDate, 'Policy effective date'),
          () => isoDateFieldError(filEffectiveDate),
        ) ?? undefined,
      filPolicyPercentage: firstValidationError(
        () => requiredFieldError(filPolicyPercentage, 'Fee in lieu percentage'),
        () => boundedIntegerFieldError(filPolicyPercentage, 'Fee in lieu percentage', 1, 99),
      ),
      scheduleAdvertisingDate:
        firstValidationError(
          () => requiredFieldError(scheduleAdvertisingDate, 'Advertising date'),
          () => isoDateFieldError(scheduleAdvertisingDate),
        ) ?? undefined,
      scheduleApplicationReceiptDate:
        firstValidationError(
          () => requiredFieldError(scheduleApplicationReceiptDate, 'Application receipt date'),
          () => isoDateFieldError(scheduleApplicationReceiptDate),
        ) ?? undefined,
      scheduleOfferReceiptDate:
        firstValidationError(
          () => requiredFieldError(scheduleOfferReceiptDate, 'Offer receipt date'),
          () => isoDateFieldError(scheduleOfferReceiptDate),
        ) ?? undefined,
      scheduleOfferEndDate:
        firstValidationError(
          () => requiredFieldError(scheduleOfferEndDate, 'Offer end date'),
          () => isoDateFieldError(scheduleOfferEndDate),
        ) ?? undefined,
      scheduleOfferWithdrawalDate:
        firstValidationError(
          () => requiredFieldError(scheduleOfferWithdrawalDate, 'Offer withdrawal date'),
          () => isoDateFieldError(scheduleOfferWithdrawalDate),
        ) ?? undefined,
      scheduleTeacMeetingDate:
        firstValidationError(
          () => requiredFieldError(scheduleTeacMeetingDate, 'TEAC meeting date'),
          () => isoDateFieldError(scheduleTeacMeetingDate),
        ) ?? undefined,
    }),
    [
      feeEffectiveDate,
      feeOrgUnitNo,
      feePolicyPercentage,
      filEffectiveDate,
      filPolicyPercentage,
      scheduleAdvertisingDate,
      scheduleApplicationReceiptDate,
      scheduleOfferReceiptDate,
      scheduleOfferEndDate,
      scheduleOfferWithdrawalDate,
      scheduleTeacMeetingDate,
    ],
  )

  const feeHasValidationError = Boolean(
    fieldErrors.feeEffectiveDate || fieldErrors.feeOrgUnitNo || fieldErrors.feePolicyPercentage,
  )
  const filHasValidationError = Boolean(
    fieldErrors.filEffectiveDate || fieldErrors.filPolicyPercentage,
  )
  const scheduleHasValidationError = Boolean(
    fieldErrors.scheduleAdvertisingDate ||
    fieldErrors.scheduleApplicationReceiptDate ||
    fieldErrors.scheduleOfferReceiptDate ||
    fieldErrors.scheduleOfferEndDate ||
    fieldErrors.scheduleOfferWithdrawalDate ||
    fieldErrors.scheduleTeacMeetingDate,
  )

  const markFieldTouched = (field: PolicyField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const feeFieldError = (field: PolicyField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showFeeValidationErrors)

  const filFieldError = (field: PolicyField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showFilValidationErrors)

  const scheduleFieldError = (field: PolicyField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showScheduleValidationErrors)

  const clearNotifications = (): void => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const resetFeeForm = (): void => {
    setFeeEffectiveDate('')
    setFeeOrgUnitNo('')
    setFeePolicyPercentage('')
    setEditingFeePolicyId(null)
    setShowFeeValidationErrors(false)
  }

  const resetFilForm = (): void => {
    setFilEffectiveDate('')
    setFilPolicyPercentage('')
    setEditingFilPolicyId(null)
    setShowFilValidationErrors(false)
  }

  const resetScheduleForm = (): void => {
    setScheduleAdvertisingDate('')
    setScheduleApplicationReceiptDate('')
    setScheduleOfferReceiptDate('')
    setScheduleOfferEndDate('')
    setScheduleOfferWithdrawalDate('')
    setScheduleTeacMeetingDate('')
    setEditingScheduleId(null)
    setShowScheduleValidationErrors(false)
  }

  const onScheduleSort = (sortField: ExportScheduleSortField): void => {
    setScheduleSortDirection((currentDirection) =>
      scheduleSortField === sortField && currentDirection === 'asc' ? 'desc' : 'asc',
    )
    setScheduleSortField(sortField)
    setPage(0)
  }

  const loadPolicies = useCallback(async () => {
    setIsLoadingPolicies(true)
    clearNotifications()

    try {
      if (!canAccessArea) {
        setFeePolicies([])
        setFilPolicies([])
        setExportSchedules([])
        setTotalRows(0)
        return
      }

      if (area === 'fee') {
        const loadedPage = await fetchFeePolicyPage(page, pageSize)
        setFeePolicies(loadedPage.rows)
        setTotalRows(loadedPage.total)
      } else if (area === 'fil') {
        const loadedPage = await fetchFilPolicyPage(page, pageSize)
        setFilPolicies(loadedPage.rows)
        setTotalRows(loadedPage.total)
      } else {
        const loadedPage = await fetchExportSchedulePage(
          page,
          pageSize,
          scheduleSortField,
          scheduleSortDirection,
        )
        setExportSchedules(loadedPage.rows)
        setTotalRows(loadedPage.total)
      }
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Policy data is currently unavailable. Refresh the page or contact support if this keeps happening.',
        )
      } else {
        setErrorMessage('Unable to load policy data.')
      }
    } finally {
      setIsLoadingPolicies(false)
    }
  }, [area, canAccessArea, page, pageSize, scheduleSortDirection, scheduleSortField])

  useEffect(() => {
    void loadPolicies()
  }, [loadPolicies])

  useEffect(() => {
    let cancelled = false

    if (area !== 'fee' || !canManageFeePolicy) {
      return () => {
        cancelled = true
      }
    }

    void fetchReportOptions()
      .then((options) => {
        if (cancelled) {
          return
        }

        if (!validFeeRegionOptions(options.regions)) {
          setFeeRegionOptions([])
          setFeeRegionOptionsError(FEE_REGION_OPTIONS_ERROR)
          return
        }

        setFeeRegionOptionsError('')
        setFeeRegionOptions(
          options.regions.map((option) => ({
            value: option.value.trim(),
            label: option.label.trim(),
          })),
        )
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        console.error(error)
        setFeeRegionOptions([])
        setFeeRegionOptionsError(FEE_REGION_OPTIONS_ERROR)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFeeRegionOptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [area, canManageFeePolicy])

  const upsertFeePolicy = async (): Promise<void> => {
    clearNotifications()

    if (!canManageFeePolicy) {
      setErrorMessage('Your session does not include /lexisPolicyAdmin.')
      return
    }

    if (isLoadingFeeRegionOptions || feeRegionOptionsError || feeRegionOptions.length === 0) {
      setErrorMessage(FEE_REGION_OPTIONS_ERROR)
      return
    }

    if (feeHasValidationError) {
      setShowFeeValidationErrors(true)
      setErrorMessage('Fee policy requires effective date, region, and percentage.')
      return
    }

    setIsMutatingPolicies(true)

    try {
      await upsertFeePolicyRequest({
        id: editingFeePolicyId,
        effectiveDate: feeEffectiveDate,
        orgUnitNo: feeOrgUnitNo,
        policyPercentage: feePolicyPercentage,
      })
      await loadPolicies()
      setSuccessMessage(editingFeePolicyId ? 'Fee policy updated.' : 'Fee policy added.')
      resetFeeForm()
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to save the fee policy right now. Please check your entry and try again. If this continues, contact support.',
        )
      } else {
        setErrorMessage('Unable to save the fee policy. Please try again or contact support.')
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const editFeePolicy = (row: FeePolicyRow): void => {
    if (!feeRegionOptions.some((option) => option.value === row.orgUnitNo)) {
      setErrorMessage(
        `Region ${row.orgUnitCode || row.orgUnitNo || 'unknown'} is not available in the authoritative region list and cannot be edited.`,
      )
      return
    }

    setFeeEffectiveDate(row.effectiveDate)
    setFeeOrgUnitNo(row.orgUnitNo)
    setFeePolicyPercentage(row.policyPercentage)
    setEditingFeePolicyId(row.id)
    setShowFeeValidationErrors(false)
    clearNotifications()
  }

  const deleteFeePolicy = async (rowId: string): Promise<void> => {
    clearNotifications()
    setIsMutatingPolicies(true)

    try {
      await deleteFeePolicyRequest(rowId)
      await loadPolicies()
      if (editingFeePolicyId === rowId) {
        resetFeeForm()
      }
      setSuccessMessage('Fee policy deleted.')
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to delete the fee policy. Refresh and try again, or contact support if the issue persists.',
        )
      } else {
        setErrorMessage('Fee policy delete failed.')
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const upsertFilPolicy = async (): Promise<void> => {
    clearNotifications()

    if (!canManageFilPolicy) {
      setErrorMessage('Your session does not include /lexisFILAdmin.')
      return
    }

    if (filHasValidationError) {
      setShowFilValidationErrors(true)
      setErrorMessage('Fee in lieu policy requires an effective date and percentage.')
      return
    }

    setIsMutatingPolicies(true)

    try {
      await upsertFilPolicyRequest({
        id: editingFilPolicyId,
        effectiveDate: filEffectiveDate,
        filPercentage: filPolicyPercentage,
      })
      await loadPolicies()
      setSuccessMessage(
        editingFilPolicyId ? 'Fee in lieu policy updated.' : 'Fee in lieu policy added.',
      )
      resetFilForm()
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to save the fee in lieu policy right now. Please check your entry and try again. If this continues, contact support.',
        )
      } else {
        setErrorMessage(
          'Unable to save the fee in lieu policy. Please try again or contact support.',
        )
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const editFilPolicy = (row: FilPolicyRow): void => {
    setFilEffectiveDate(row.effectiveDate)
    setFilPolicyPercentage(row.filPercentage)
    setEditingFilPolicyId(row.id)
    setShowFilValidationErrors(false)
    clearNotifications()
  }

  const deleteFilPolicy = async (rowId: string): Promise<void> => {
    clearNotifications()
    setIsMutatingPolicies(true)

    try {
      await deleteFilPolicyRequest(rowId)
      await loadPolicies()
      if (editingFilPolicyId === rowId) {
        resetFilForm()
      }
      setSuccessMessage('Fee in lieu policy deleted.')
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to delete the fee in lieu policy. Refresh and try again, or contact support if the issue persists.',
        )
      } else {
        setErrorMessage(
          'Unable to delete the fee in lieu policy. Please try again or contact support.',
        )
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const editExportSchedule = (row: ExportScheduleRow): void => {
    setScheduleAdvertisingDate(row.advertisingDate)
    setScheduleApplicationReceiptDate(row.applicationReceiptDate)
    setScheduleOfferReceiptDate(row.offerReceiptDate)
    setScheduleOfferEndDate(row.offerEndDate)
    setScheduleOfferWithdrawalDate(row.offerWithdrawalDate)
    setScheduleTeacMeetingDate(row.teacMeetingDate)
    setEditingScheduleId(row.exportScheduleId)
    setShowScheduleValidationErrors(false)
    clearNotifications()
  }

  const upsertExportSchedule = async (): Promise<void> => {
    clearNotifications()

    if (!canManageFeePolicy) {
      setErrorMessage('Your session does not include /lexisPolicyAdmin.')
      return
    }

    if (scheduleHasValidationError) {
      setShowScheduleValidationErrors(true)
      setErrorMessage('Export schedule requires all schedule dates in YYYY-MM-DD format.')
      return
    }

    setIsMutatingPolicies(true)

    try {
      const request = {
        advertisingDate: scheduleAdvertisingDate,
        applicationReceiptDate: scheduleApplicationReceiptDate,
        offerReceiptDate: scheduleOfferReceiptDate,
        offerEndDate: scheduleOfferEndDate,
        offerWithdrawalDate: scheduleOfferWithdrawalDate,
        teacMeetingDate: scheduleTeacMeetingDate,
      }
      const result = editingScheduleId
        ? await updateExportScheduleRequest(editingScheduleId, request)
        : await createExportScheduleRequest(request)
      if (!result.success) {
        setErrorMessage(result.message || 'Unable to save export schedule.')
        return
      }
      await loadPolicies()
      setSuccessMessage(
        result.message ||
          (editingScheduleId ? 'Export schedule updated.' : 'Export schedule added.'),
      )
      resetScheduleForm()
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to save the export schedule. Check the dates and try again, or contact support if this continues.',
        )
      } else {
        setErrorMessage('Unable to save the export schedule. Please try again or contact support.')
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const deleteExportSchedule = async (row: ExportScheduleRow): Promise<void> => {
    clearNotifications()
    setIsMutatingPolicies(true)

    try {
      const result = await deleteExportScheduleRequest(row.exportScheduleId)
      if (!result.success) {
        setErrorMessage(result.message || 'Unable to delete export schedule.')
        return
      }
      await loadPolicies()
      if (editingScheduleId === row.exportScheduleId) {
        resetScheduleForm()
      }
      setSuccessMessage(result.message || 'Export schedule deleted.')
    } catch (error) {
      console.error(error)
      const status = getResponseStatus(error)
      if (status) {
        setErrorMessage(
          'Unable to delete the export schedule. Refresh and try again, or contact support if the issue persists.',
        )
      } else {
        setErrorMessage(
          'Unable to delete the export schedule. Please try again or contact support.',
        )
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const renderPagination = () => (
    <Pagination
      backwardText="Previous page"
      forwardText="Next page"
      itemsPerPageText="Rows per page"
      page={page + 1}
      pageSize={pageSize}
      pageSizes={ADMIN_PAGE_SIZES}
      totalItems={totalRows}
      onChange={({ page: nextPage, pageSize: nextPageSize }) => {
        setPage(Math.max(0, nextPage - 1))
        setPageSize(nextPageSize)
      }}
    />
  )

  return (
    <Grid fullWidth className="default-grid admin-policy-page">
      <Column sm={4} md={8} lg={16}>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} />
      </Column>

      {successMessage && (
        <AppNotification
          kind="success"
          title={notificationTitle}
          subtitle={successMessage}
          lowContrast
          autoDismissMs={8000}
          onCloseButtonClick={() => setSuccessMessage('')}
        />
      )}
      {errorMessage && (
        <AppNotification
          kind="error"
          title={errorTitle}
          subtitle={errorMessage}
          lowContrast
          onCloseButtonClick={() => setErrorMessage('')}
        />
      )}
      {area === 'fee' && feeRegionOptionsError && (
        <AppNotification
          kind="error"
          title="Region options unavailable"
          subtitle={feeRegionOptionsError}
          lowContrast
        />
      )}

      {area === 'fee' && (
        <Column sm={4} md={8} lg={16}>
          <div className="admin-policy-workspace">
            <Tile className="create-form-tile admin-policy-editor-tile">
              <h2 className="dashboard-title">Fee policy administration</h2>
              <div className="legacy-search-grid create-form-grid">
                <IsoDatePicker
                  id="feeEffectiveDate"
                  labelText="Policy effective date"
                  value={feeEffectiveDate}
                  invalid={!!feeFieldError('feeEffectiveDate')}
                  invalidText={feeFieldError('feeEffectiveDate')}
                  onBlur={() => markFieldTouched('feeEffectiveDate')}
                  onChange={setFeeEffectiveDate}
                />
                <Select
                  id="feeOrgUnitNo"
                  labelText="Region"
                  value={feeOrgUnitNo}
                  invalid={!!feeFieldError('feeOrgUnitNo')}
                  invalidText={feeFieldError('feeOrgUnitNo')}
                  onBlur={() => markFieldTouched('feeOrgUnitNo')}
                  onChange={(event) => setFeeOrgUnitNo(event.target.value)}
                  disabled={
                    isLoadingPolicies ||
                    isMutatingPolicies ||
                    isLoadingFeeRegionOptions ||
                    Boolean(feeRegionOptionsError) ||
                    !canManageFeePolicy
                  }
                >
                  <SelectItem
                    value=""
                    text={isLoadingFeeRegionOptions ? 'Loading regions...' : 'Choose a region'}
                  />
                  {feeRegionOptions.map((option) => {
                    const knownCode = feePolicies.find(
                      (policy) => policy.orgUnitNo === option.value,
                    )?.orgUnitCode
                    const optionText = knownCode
                      ? `${knownCode} — ${option.label}`
                      : `${option.label} (${option.value})`
                    return <SelectItem key={option.value} value={option.value} text={optionText} />
                  })}
                </Select>
                <TextInput
                  id="feePolicyPercentage"
                  labelText="Fee increase percentage"
                  value={feePolicyPercentage}
                  invalid={!!feeFieldError('feePolicyPercentage')}
                  invalidText={feeFieldError('feePolicyPercentage')}
                  onBlur={() => markFieldTouched('feePolicyPercentage')}
                  onChange={(event) => setFeePolicyPercentage(event.target.value)}
                />
              </div>
              <div className="legacy-search-actions create-form-actions">
                <Button
                  kind="primary"
                  onClick={() => void upsertFeePolicy()}
                  disabled={
                    isLoadingPolicies ||
                    isMutatingPolicies ||
                    isLoadingFeeRegionOptions ||
                    Boolean(feeRegionOptionsError) ||
                    feeRegionOptions.length === 0 ||
                    !canManageFeePolicy
                  }
                >
                  {editingFeePolicyId ? 'Update Fee Policy' : 'Add Fee Policy'}
                </Button>
                <Button
                  kind="ghost"
                  onClick={resetFeeForm}
                  disabled={isLoadingPolicies || isMutatingPolicies}
                >
                  Cancel Edit
                </Button>
              </div>
            </Tile>

            <SearchResultsTableFrame
              loading={isLoadingPolicies}
              loadingDescription={loadingDescription}
              totalItems={isLoadingPolicies && feePolicies.length === 0 ? undefined : totalRows}
            >
              {feePolicies.length > 0 ? (
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Effective Date</TableHeader>
                      <TableHeader>Region</TableHeader>
                      <TableHeader>Fee Increase %</TableHeader>
                      <TableHeader>Entry User</TableHeader>
                      <TableHeader>Entry Timestamp</TableHeader>
                      <TableHeader>Update User</TableHeader>
                      <TableHeader>Update Timestamp</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {feePolicies.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.effectiveDate}</TableCell>
                        <TableCell title={row.orgUnitName}>
                          {row.orgUnitCode || row.orgUnitNo}
                        </TableCell>
                        <TableCell>{row.policyPercentage}</TableCell>
                        <TableCell>{row.entryUserId}</TableCell>
                        <TableCell>{row.entryTimestamp}</TableCell>
                        <TableCell>{row.updateUserId}</TableCell>
                        <TableCell>{row.updateTimestamp}</TableCell>
                        <TableCell>
                          <div className="admin-policy-row-actions">
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => editFeePolicy(row)}
                              disabled={
                                isLoadingPolicies ||
                                isMutatingPolicies ||
                                isLoadingFeeRegionOptions ||
                                Boolean(feeRegionOptionsError) ||
                                feeRegionOptions.length === 0
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => void deleteFeePolicy(row.id)}
                              disabled={isLoadingPolicies || isMutatingPolicies}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !isLoadingPolicies ? (
                <EmptyState
                  title="No fee policies found"
                  description="No fee policy rows are available."
                  headingLevel={3}
                />
              ) : null}
              {totalRows > 0 && renderPagination()}
            </SearchResultsTableFrame>
          </div>
        </Column>
      )}

      {area === 'fil' && (
        <Column sm={4} md={8} lg={16}>
          <div className="admin-policy-workspace">
            <Tile className="create-form-tile admin-policy-editor-tile">
              <h2 className="dashboard-title">Fee in lieu percent policy administration</h2>
              <div className="legacy-search-grid create-form-grid">
                <IsoDatePicker
                  id="filEffectiveDate"
                  labelText="Policy effective date"
                  value={filEffectiveDate}
                  invalid={!!filFieldError('filEffectiveDate')}
                  invalidText={filFieldError('filEffectiveDate')}
                  onBlur={() => markFieldTouched('filEffectiveDate')}
                  onChange={setFilEffectiveDate}
                />
                <TextInput
                  id="filPolicyPercentage"
                  labelText="Fee in lieu percentage"
                  value={filPolicyPercentage}
                  invalid={!!filFieldError('filPolicyPercentage')}
                  invalidText={filFieldError('filPolicyPercentage')}
                  onBlur={() => markFieldTouched('filPolicyPercentage')}
                  onChange={(event) => setFilPolicyPercentage(event.target.value)}
                />
              </div>
              <div className="legacy-search-actions create-form-actions">
                <Button
                  kind="primary"
                  onClick={() => void upsertFilPolicy()}
                  disabled={isLoadingPolicies || isMutatingPolicies || !canManageFilPolicy}
                >
                  {editingFilPolicyId ? 'Update fee in lieu policy' : 'Add fee in lieu policy'}
                </Button>
                <Button
                  kind="ghost"
                  onClick={resetFilForm}
                  disabled={isLoadingPolicies || isMutatingPolicies}
                >
                  Cancel Edit
                </Button>
              </div>
            </Tile>

            <SearchResultsTableFrame
              loading={isLoadingPolicies}
              loadingDescription={loadingDescription}
              totalItems={isLoadingPolicies && filPolicies.length === 0 ? undefined : totalRows}
            >
              {filPolicies.length > 0 ? (
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Effective date</TableHeader>
                      <TableHeader>Fee in lieu %</TableHeader>
                      <TableHeader>Entry user</TableHeader>
                      <TableHeader>Entry timestamp</TableHeader>
                      <TableHeader>Update user</TableHeader>
                      <TableHeader>Update timestamp</TableHeader>
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filPolicies.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.effectiveDate}</TableCell>
                        <TableCell>{row.filPercentage}</TableCell>
                        <TableCell>{row.entryUserId}</TableCell>
                        <TableCell>{row.entryTimestamp}</TableCell>
                        <TableCell>{row.updateUserId}</TableCell>
                        <TableCell>{row.updateTimestamp}</TableCell>
                        <TableCell>
                          <div className="admin-policy-row-actions">
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => editFilPolicy(row)}
                              disabled={isLoadingPolicies || isMutatingPolicies}
                            >
                              Edit
                            </Button>
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => void deleteFilPolicy(row.id)}
                              disabled={isLoadingPolicies || isMutatingPolicies}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !isLoadingPolicies ? (
                <EmptyState
                  title="No fee-in-lieu policies found"
                  description="No fee-in-lieu policy rows are available."
                  headingLevel={3}
                />
              ) : null}
              {totalRows > 0 && renderPagination()}
            </SearchResultsTableFrame>
          </div>
        </Column>
      )}

      {area === 'schedule' && (
        <Column sm={4} md={8} lg={16}>
          <div className="admin-policy-workspace">
            <Tile className="create-form-tile admin-policy-editor-tile">
              <h2 className="dashboard-title">Export schedule administration</h2>
              <div className="legacy-search-grid create-form-grid">
                <IsoDatePicker
                  id="scheduleAdvertisingDate"
                  labelText="Advertising date"
                  value={scheduleAdvertisingDate}
                  invalid={!!scheduleFieldError('scheduleAdvertisingDate')}
                  invalidText={scheduleFieldError('scheduleAdvertisingDate')}
                  onBlur={() => markFieldTouched('scheduleAdvertisingDate')}
                  onChange={setScheduleAdvertisingDate}
                />
                <IsoDatePicker
                  id="scheduleApplicationReceiptDate"
                  labelText="Application receipt date"
                  value={scheduleApplicationReceiptDate}
                  invalid={!!scheduleFieldError('scheduleApplicationReceiptDate')}
                  invalidText={scheduleFieldError('scheduleApplicationReceiptDate')}
                  onBlur={() => markFieldTouched('scheduleApplicationReceiptDate')}
                  onChange={setScheduleApplicationReceiptDate}
                />
                <IsoDatePicker
                  id="scheduleOfferReceiptDate"
                  labelText="Offer receipt date"
                  value={scheduleOfferReceiptDate}
                  invalid={!!scheduleFieldError('scheduleOfferReceiptDate')}
                  invalidText={scheduleFieldError('scheduleOfferReceiptDate')}
                  onBlur={() => markFieldTouched('scheduleOfferReceiptDate')}
                  onChange={setScheduleOfferReceiptDate}
                />
                <IsoDatePicker
                  id="scheduleOfferEndDate"
                  labelText="Offer end date"
                  value={scheduleOfferEndDate}
                  invalid={!!scheduleFieldError('scheduleOfferEndDate')}
                  invalidText={scheduleFieldError('scheduleOfferEndDate')}
                  onBlur={() => markFieldTouched('scheduleOfferEndDate')}
                  onChange={setScheduleOfferEndDate}
                />
                <IsoDatePicker
                  id="scheduleOfferWithdrawalDate"
                  labelText="Offer withdrawal date"
                  value={scheduleOfferWithdrawalDate}
                  invalid={!!scheduleFieldError('scheduleOfferWithdrawalDate')}
                  invalidText={scheduleFieldError('scheduleOfferWithdrawalDate')}
                  onBlur={() => markFieldTouched('scheduleOfferWithdrawalDate')}
                  onChange={setScheduleOfferWithdrawalDate}
                />
                <IsoDatePicker
                  id="scheduleTeacMeetingDate"
                  labelText="TEAC meeting date"
                  value={scheduleTeacMeetingDate}
                  invalid={!!scheduleFieldError('scheduleTeacMeetingDate')}
                  invalidText={scheduleFieldError('scheduleTeacMeetingDate')}
                  onBlur={() => markFieldTouched('scheduleTeacMeetingDate')}
                  onChange={setScheduleTeacMeetingDate}
                />
              </div>
              <div className="legacy-search-actions create-form-actions">
                <Button
                  kind="primary"
                  onClick={() => void upsertExportSchedule()}
                  disabled={isLoadingPolicies || isMutatingPolicies || !canManageFeePolicy}
                >
                  {editingScheduleId ? 'Update Export Schedule' : 'Add Export Schedule'}
                </Button>
                <Button
                  kind="ghost"
                  onClick={resetScheduleForm}
                  disabled={isLoadingPolicies || isMutatingPolicies}
                >
                  {editingScheduleId ? 'Cancel Edit' : 'Clear Schedule'}
                </Button>
              </div>
            </Tile>

            <SearchResultsTableFrame
              loading={isLoadingPolicies}
              loadingDescription={loadingDescription}
              totalItems={isLoadingPolicies && exportSchedules.length === 0 ? undefined : totalRows}
            >
              {exportSchedules.length > 0 ? (
                <Table useZebraStyles>
                  <TableHead>
                    <TableRow>
                      {SCHEDULE_SORT_COLUMNS.map((column) => (
                        <TableHeader key={column.id}>
                          <button
                            type="button"
                            className="legacy-sort-button"
                            onClick={() => onScheduleSort(column.id)}
                          >
                            {column.label}
                            {scheduleSortField === column.id
                              ? ` (${scheduleSortDirection.toUpperCase()})`
                              : ''}
                          </button>
                        </TableHeader>
                      ))}
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exportSchedules.map((row) => (
                      <TableRow key={row.exportScheduleId || row.advertisingDate}>
                        <TableCell>{row.exportScheduleId}</TableCell>
                        <TableCell>{row.advertisingDate}</TableCell>
                        <TableCell>{row.applicationReceiptDate}</TableCell>
                        <TableCell>{row.offerReceiptDate}</TableCell>
                        <TableCell>{row.offerEndDate}</TableCell>
                        <TableCell>{row.offerWithdrawalDate}</TableCell>
                        <TableCell>{row.teacMeetingDate}</TableCell>
                        <TableCell>
                          {canSearchApplications ? (
                            <Link
                              to={applicationSearchPathForAdvertisingDate(row.advertisingDate)}
                              aria-label={`View ${row.applicationCount} applications advertised on ${row.advertisingDate}`}
                            >
                              {row.applicationCount}
                            </Link>
                          ) : (
                            row.applicationCount
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="admin-policy-row-actions">
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => editExportSchedule(row)}
                              disabled={isLoadingPolicies || isMutatingPolicies || !row.mutable}
                            >
                              Edit
                            </Button>
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => void deleteExportSchedule(row)}
                              disabled={isLoadingPolicies || isMutatingPolicies || !row.mutable}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !isLoadingPolicies ? (
                <EmptyState
                  title="No export schedules found"
                  description="No export schedule rows are available."
                  headingLevel={3}
                />
              ) : null}
              {totalRows > 0 && renderPagination()}
            </SearchResultsTableFrame>
          </div>
        </Column>
      )}
    </Grid>
  )
}

export default AdminPoliciesPage
