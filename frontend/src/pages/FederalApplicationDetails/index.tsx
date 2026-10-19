import {
  RecordField,
  RecordFieldCell,
  RecordFieldGrid,
  RecordFieldRow,
} from '@/pages/shared/RecordFieldGrid'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Column,
  Grid,
  HStack,
  InlineNotification,
  Loading,
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
  Tile,
} from '@carbon/react'
import { useLocation, useParams } from 'react-router-dom'
import ContentLoadingOverlay from '@/components/ContentLoadingOverlay'
import EmptyState from '@/components/EmptyState'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import PageHeader from '@/components/PageHeader'
import PendingIcon from '@/components/PendingIcon'
import StatusTag from '@/components/StatusTag'
import TableFrame from '@/components/TableFrame'
import UnsavedChangesGuard from '@/components/UnsavedChangesGuard'
import { useAuth } from '@/context/auth/useAuth'
import { ActionResultNotification } from '../../components/ActionResultNotification'
import type { FederalApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '../shared/DetailSections'
import { displayValue } from '@/pages/shared/detail-page-utils'
import { readDetailReturnTo } from '@/pages/shared/detail-navigation'
import { useEditSections } from '@/pages/shared/useEditSections'
import { hasFieldErrors, useFieldErrors, type FieldErrors } from '@/pages/shared/useFieldErrors'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { useReloadPreservedTab } from '@/pages/shared/useReloadPreservedTab'
import {
  fetchFederalApplicationDetail,
  releaseApplicationEditLock,
} from '@/service/lexis-detail-service'
import { withoutActionError, type ActionResult } from '@/utils/action-result'
import { updateFederalApplicationStatus } from '@/service/federal-application-mutation-service'
import {
  fetchFederalApplicationRemarks,
  saveFederalApplicationRemark,
  type FederalApplicationRemark,
} from '@/service/federal-application-remarks-service'
import {
  fetchApplicationPackageScales,
  type ApplicationPackageScaleRow,
} from '@/service/provincial-application-items-service'
import { formatBusinessDateTimeLabel, formatBusinessIsoDate } from '@/utils/date'
import { fieldErrorText } from '@/utils/field-error'
import { focusFirstInvalidFieldAfterRender } from '@/utils/focus'
import { displayAuditIdentity, displayTableValue } from '@/utils/text'
import { requiredLabel } from '@/utils/required-label'
import { requiredFieldError } from '@/pages/shared/create-form-utils'
import { allowedFederalStatusTransitions, type FederalStatusTransition } from './status-transitions'
import RequiredFieldsLegend from '@/components/RequiredFieldsLegend'
import { displayVolume } from '@/utils/volume'

type FederalApplicationScaleRow = ApplicationPackageScaleRow & {
  packageNumber: string
}

type FederalApplicationDetailTabKey = 'owner' | 'agent' | 'application' | 'items' | 'remarks'

// INTENTIONAL_LEGACY_DIVERGENCE(FEDERAL_RECORD_TABS): Federal records have no Offers, Documents
// or Shipping details tab. A saved tab that is not listed here opens the first tab.
const FEDERAL_APPLICATION_DETAIL_TAB_SLOTS: readonly FederalApplicationDetailTabKey[] = [
  'owner',
  'agent',
  'application',
  'items',
  'remarks',
]

// Withdraw and Reject each open the status form with their status fixed.
type FederalStatusSection = `status-${FederalStatusTransition['code']}`

type FederalEditSection = FederalStatusSection | 'new-remark' | `remark-${number}`

type FederalStatusField = 'statusRemark'

// The server refuses remark text outside plain ASCII with this message.
const UNSUPPORTED_REMARK_CHARACTERS_MESSAGE =
  'Application remarks contain unsupported special characters. Remove them and try again.'

const isRemarkSection = (section: FederalEditSection | null): boolean =>
  section === 'new-remark' || !!section?.startsWith('remark-')

const statusSectionFor = (transition: FederalStatusTransition): FederalStatusSection =>
  `status-${transition.code}`

const isStatusSection = (section: FederalEditSection | null): section is FederalStatusSection =>
  section === 'status-WDN' || section === 'status-REJ'

const federalStatusServerField = (message: string): FederalStatusField | undefined =>
  message === 'A remark is required when rejecting or withdrawing a federal application.' ||
  message === 'Remark is too long to save. Shorten it and try again.' ||
  message === UNSUPPORTED_REMARK_CHARACTERS_MESSAGE
    ? 'statusRemark'
    : undefined

const federalRemarkServerField = (message: string): 'remark' | undefined =>
  message === 'Remark is required.' ||
  message === 'Remark must not exceed 250 characters.' ||
  message === UNSUPPORTED_REMARK_CHARACTERS_MESSAGE
    ? 'remark'
    : undefined

/** Splits server errors into the ones that belong to a field and the rest. */
const splitServerErrors = <F extends string>(
  errors: string[],
  fieldFor: (message: string) => F | undefined,
): { fieldErrors: FieldErrors<F>; otherErrors: string[] } => {
  const fieldErrors: FieldErrors<F> = {}
  const otherErrors: string[] = []
  for (const message of errors) {
    const field = fieldFor(message)
    if (!field) otherErrors.push(message)
    else fieldErrors[field] ??= message
  }
  return { fieldErrors, otherErrors }
}

const applicantTypeLabel = (value: string | null | undefined): string => {
  const normalizedValue = value?.trim().toUpperCase()
  if (normalizedValue === 'A') return 'Agent'
  if (normalizedValue === 'O') return 'Owner'
  return value?.trim() ?? ''
}

const FederalApplicationDetailsPage = () => {
  const { canPerform, defaultRoute } = useAuth()
  const location = useLocation()
  const { applicationNumber } = useParams()
  const fallbackReturnTo = canPerform('/federalApplicationSearch')
    ? { label: 'Federal application search', to: '/federal' }
    : { label: 'Your landing page', to: defaultRoute }
  const detailReturnTo = readDetailReturnTo(location.state) ?? fallbackReturnTo
  const [detail, setDetail] = useState<FederalApplicationDetail | null>(null)
  const detailRef = useRef<FederalApplicationDetail | null>(null)
  const [remarkRows, setRemarkRows] = useState<FederalApplicationRemark[]>([])
  const [scaleRows, setScaleRows] = useState<FederalApplicationScaleRow[]>([])
  const [scaleErrorMessage, setScaleErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [remarksErrorMessage, setRemarksErrorMessage] = useState('')
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [statusRemark, setStatusRemark] = useState('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [editingSection, setEditingSection] = useState<FederalEditSection | null>(null)
  const isEditingFederalStatus = isStatusSection(editingSection)
  const isEditingFederalRemarks = isRemarkSection(editingSection)
  const {
    clearFieldError: clearStatusFieldError,
    resetFieldErrors: resetStatusFieldErrors,
    showFieldErrors: showStatusFieldErrors,
    invalidProps: statusInvalidProps,
  } = useFieldErrors<FederalStatusField>()
  const statusFormRef = useRef<HTMLDivElement>(null)
  const remarkFormRef = useRef<HTMLDivElement>(null)
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [selectedFederalApplicationTab, selectFederalApplicationTab] = useReloadPreservedTab({
    tabs: FEDERAL_APPLICATION_DETAIL_TAB_SLOTS,
    defaultTab: 'owner',
  })
  const beginDetailRequest = useLatestRequestGuard()
  const currentDetail =
    detail && String(detail.applicationNumber) === applicationNumber ? detail : null
  const federalApplicationDisplayNumber =
    currentDetail?.federalApplicationNumber?.trim() ||
    String(currentDetail?.applicationNumber ?? applicationNumber ?? '').trim()
  const isRefreshingDetail = loading && !!currentDetail

  const federalApplicationLocked = currentDetail?.locked === true
  const canViewFederalRemarks =
    canPerform('/federalApplicationDetails') &&
    canPerform('viewFederalApplication') &&
    canPerform('/applicationRemarks')
  // Writes also need the application's region when the user's grant is regional.
  const applicationOrgUnit = currentDetail?.orgUnitNumber ?? null
  const canManageFederalApplication = canPerform('manageFederalApplication', applicationOrgUnit)
  const canMutateFederalApplication =
    canManageFederalApplication &&
    !!currentDetail &&
    !currentDetail.readOnly &&
    !federalApplicationLocked
  // Remarks can be added and edited at any status.
  const canManageFederalRemarks =
    canManageFederalApplication && !!currentDetail && !federalApplicationLocked
  const applicationStatusCode = currentDetail?.statusCode?.trim().toUpperCase() ?? ''
  const businessToday = formatBusinessIsoDate()
  const statusTransitions = allowedFederalStatusTransitions(
    applicationStatusCode,
    currentDetail?.listingDate,
    businessToday,
  )
  const editingStatusTransition =
    statusTransitions.find((transition) => statusSectionFor(transition) === editingSection) ?? null
  const statusCode = editingStatusTransition?.code ?? ''
  const statusDraftDirty =
    canMutateFederalApplication && !!editingStatusTransition && statusRemark.length > 0
  const remarkBaseline =
    editingRemarkId === null
      ? ''
      : (remarkRows.find((remark) => remark.remarkId === editingRemarkId)?.remark ?? '')
  const remarkDraftDirty =
    canManageFederalRemarks && isEditingFederalRemarks && remarkDraft !== remarkBaseline
  const hasAgent = currentDetail?.ownerApplicantType?.trim().toUpperCase() === 'A'
  const federalApplicationDetailTabs: FederalApplicationDetailTabKey[] = [
    'owner',
    ...(hasAgent ? (['agent'] as const) : []),
    'application',
    'items',
    ...(canViewFederalRemarks ? (['remarks'] as const) : []),
  ]
  const activeFederalApplicationTab = federalApplicationDetailTabs.includes(
    selectedFederalApplicationTab,
  )
    ? selectedFederalApplicationTab
    : 'owner'
  const selectedFederalApplicationTabIndex = Math.max(
    0,
    FEDERAL_APPLICATION_DETAIL_TAB_SLOTS.indexOf(activeFederalApplicationTab),
  )

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  useEffect(() => {
    const load = async () => {
      const isLatestRequest = beginDetailRequest()
      if (!applicationNumber) {
        setErrorMessage('Application number is missing from the route.')
        setDetail(null)
        setRemarkRows([])
        setScaleRows([])
        setScaleErrorMessage('')
        setRemarksErrorMessage('')
        setActionResult(null)
        setLoading(false)
        return
      }

      const isRefreshingCurrentApplication =
        detailRef.current !== null &&
        String(detailRef.current.applicationNumber) === applicationNumber
      setLoading(true)
      setErrorMessage('')
      setRemarksErrorMessage('')
      if (!isRefreshingCurrentApplication) {
        setRemarkRows([])
        setScaleRows([])
      }
      setScaleErrorMessage('')
      setActionResult(null)
      try {
        const response = await fetchFederalApplicationDetail(applicationNumber)
        if (!isLatestRequest()) {
          return
        }
        setDetail(response)
        setStatusRemark('')
        setEditingSection(null)
        if (!response) {
          setErrorMessage(`No federal application found for ${applicationNumber}.`)
          setRemarkRows([])
          setScaleRows([])
          setScaleErrorMessage('')
          setRemarksErrorMessage('')
          return
        }

        const loadScaleRows = async () => {
          try {
            const packageScaleRows = await Promise.all(
              response.packages.map(async (packageNumber) =>
                (await fetchApplicationPackageScales(packageNumber)).map((row) => ({
                  ...row,
                  packageNumber,
                })),
              ),
            )
            if (isLatestRequest()) {
              setScaleRows(packageScaleRows.flat())
              setScaleErrorMessage('')
            }
          } catch (error) {
            if (isLatestRequest()) {
              console.error(error)
              setScaleRows([])
              setScaleErrorMessage('Unable to retrieve federal application scale details.')
            }
          }
        }

        const loadRemarks = async () => {
          if (!canViewFederalRemarks) {
            if (isLatestRequest()) {
              setRemarkRows([])
              setRemarksErrorMessage('')
            }
            return
          }

          try {
            const remarks = await fetchFederalApplicationRemarks(applicationNumber)
            if (isLatestRequest()) {
              setRemarkRows(remarks)
              setRemarksErrorMessage('')
            }
          } catch (error) {
            if (isLatestRequest()) {
              console.error(error)
              setRemarkRows([])
              setRemarksErrorMessage('Unable to retrieve federal application remarks.')
            }
          }
        }

        await Promise.all([loadScaleRows(), loadRemarks()])
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setErrorMessage('Unable to retrieve federal application detail.')
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false)
        }
      }
    }

    void load()
  }, [applicationNumber, beginDetailRequest, canViewFederalRemarks])

  useEffect(() => {
    return () => {
      if (applicationNumber && canManageFederalApplication) {
        void releaseApplicationEditLock(applicationNumber)
      }
    }
  }, [applicationNumber, canManageFederalApplication])

  const refreshDetail = useCallback(async () => {
    if (!applicationNumber) return
    const refreshed = await fetchFederalApplicationDetail(applicationNumber)
    setDetail(refreshed)
    setStatusRemark('')
    setEditingSection((current) => (isStatusSection(current) ? null : current))
    if (canViewFederalRemarks) {
      try {
        setRemarkRows(await fetchFederalApplicationRemarks(applicationNumber))
        setRemarksErrorMessage('')
      } catch (error) {
        console.error(error)
        setRemarkRows([])
        setRemarksErrorMessage('Unable to refresh federal application remarks.')
      }
    }
  }, [applicationNumber, canViewFederalRemarks])

  const onSaveStatus = useCallback(async (): Promise<boolean> => {
    if (
      !applicationNumber ||
      !canMutateFederalApplication ||
      !statusTransitions.some((transition) => transition.code === statusCode)
    )
      return false
    const statusRemarkError = requiredFieldError(statusRemark, 'Remark')
    if (!showStatusFieldErrors({ statusRemark: statusRemarkError }, () => statusFormRef.current)) {
      return false
    }
    setActionResult(null)
    setIsSavingStatus(true)
    try {
      const result = await updateFederalApplicationStatus(
        applicationNumber,
        statusCode,
        statusRemark,
      )
      if (!result.success) {
        const { fieldErrors, otherErrors } = splitServerErrors(
          result.errors,
          federalStatusServerField,
        )
        showStatusFieldErrors(fieldErrors, () => statusFormRef.current)
        if (otherErrors.length > 0 || !hasFieldErrors(fieldErrors)) {
          setActionResult({
            kind: 'error',
            message: otherErrors[0] || 'Unable to update federal application status.',
          })
        }
        return false
      }
      try {
        await refreshDetail()
        setActionResult({
          kind: 'success',
          message: result.message || 'Federal application status updated.',
        })
      } catch {
        setActionResult({
          kind: 'warning',
          message:
            'Federal application status updated, but details could not be refreshed. Reload before making more changes.',
        })
      }
      setEditingSection((current) => (isStatusSection(current) ? null : current))
      return true
    } catch (error) {
      console.error(error)
      setActionResult({ kind: 'error', message: 'Unable to update federal application status.' })
      return false
    } finally {
      setIsSavingStatus(false)
    }
  }, [
    applicationNumber,
    canMutateFederalApplication,
    refreshDetail,
    showStatusFieldErrors,
    statusCode,
    statusRemark,
    statusTransitions,
  ])

  const onSaveRemark = useCallback(async (): Promise<boolean> => {
    if (!applicationNumber || !canManageFederalRemarks || isSavingRemark) return false

    if (editingRemarkId !== null && !remarkDraftDirty) {
      setRemarkValidationMessage('')
      setActionResult(null)
      setEditingSection(null)
      setRemarkDraft('')
      setEditingRemarkId(null)
      return true
    }

    const normalizedRemark = remarkDraft.trim()
    const remarkError = !normalizedRemark
      ? 'Remark is required.'
      : normalizedRemark.length > 250
        ? 'Remark must not exceed 250 characters.'
        : ''
    if (remarkError) {
      setRemarkValidationMessage(remarkError)
      focusFirstInvalidFieldAfterRender(() => remarkFormRef.current)
      return false
    }

    setRemarkValidationMessage('')
    setActionResult(null)
    setIsSavingRemark(true)
    try {
      const result = await saveFederalApplicationRemark(
        applicationNumber,
        normalizedRemark,
        editingRemarkId ?? undefined,
      )
      if (!result.success) {
        const { fieldErrors, otherErrors } = splitServerErrors(
          result.errors,
          federalRemarkServerField,
        )
        if (fieldErrors.remark) {
          setRemarkValidationMessage(fieldErrors.remark)
          focusFirstInvalidFieldAfterRender(() => remarkFormRef.current)
        }
        if (otherErrors.length > 0 || !fieldErrors.remark) {
          setActionResult({
            kind: 'error',
            message: otherErrors[0] || 'Unable to save federal application remark.',
          })
        }
        return false
      }
      try {
        setRemarkRows(await fetchFederalApplicationRemarks(applicationNumber))
        setRemarksErrorMessage('')
        setActionResult({
          kind: 'success',
          message: result.message || 'Federal application remark saved.',
        })
      } catch {
        setActionResult({
          kind: 'warning',
          message:
            'Federal application remark saved, but remarks could not be refreshed. Reload before making more changes.',
        })
      }
      setEditingRemarkId(null)
      setRemarkDraft('')
      setRemarkValidationMessage('')
      setEditingSection((current) => (isRemarkSection(current) ? null : current))
      return true
    } catch (error) {
      console.error(error)
      setActionResult({ kind: 'error', message: 'Unable to save federal application remark.' })
      return false
    } finally {
      setIsSavingRemark(false)
    }
  }, [
    applicationNumber,
    canManageFederalRemarks,
    editingRemarkId,
    isSavingRemark,
    remarkDraft,
    remarkDraftDirty,
  ])

  const onDiscardFederalSection = useCallback(
    (section: FederalEditSection) => {
      if (isStatusSection(section)) {
        setStatusRemark('')
        resetStatusFieldErrors()
      } else {
        setRemarkDraft('')
        setEditingRemarkId(null)
        setRemarkValidationMessage('')
      }
      setActionResult(withoutActionError)
    },
    [resetStatusFieldErrors],
  )

  const isFederalApplicationDirty = statusDraftDirty || remarkDraftDirty
  const isFederalApplicationBusy = isSavingStatus || isSavingRemark
  const onDiscardFederalApplicationChanges = useCallback(() => {
    setStatusRemark('')
    setRemarkDraft('')
    setEditingRemarkId(null)
    setRemarkValidationMessage('')
    resetStatusFieldErrors()
    setEditingSection(null)
    setActionResult(withoutActionError)
  }, [resetStatusFieldErrors])

  const sections = useEditSections<FederalEditSection>({
    isDirty: isFederalApplicationDirty,
    onDiscard: onDiscardFederalSection,
    state: [editingSection, setEditingSection],
    // Every draft belongs to a section; the guard holds tab switches and new edits during a save.
    leaveGuard: {
      isDirty: isFederalApplicationDirty,
      isBusy: isFederalApplicationBusy,
      onDiscard: () => undefined,
    },
  })
  const editingRemarkSection = isRemarkSection(editingSection) ? editingSection : null

  const addFederalRemarkButton =
    canManageFederalRemarks && !isEditingFederalRemarks ? (
      <Button
        ref={sections.editButtonRef('new-remark')}
        kind="tertiary"
        size="md"
        onClick={() =>
          sections.startEditing('new-remark', () => {
            setRemarkDraft('')
            setEditingRemarkId(null)
            setRemarkValidationMessage('')
          })
        }
      >
        Add remark
      </Button>
    ) : undefined
  // A tab with nothing in it shows its empty state on the tab background, without a card.
  const federalRemarksEmpty =
    !remarksErrorMessage && remarkRows.length === 0 && !isEditingFederalRemarks

  return (
    <Grid fullWidth className="default-grid detail-page-grid">
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label={fallbackReturnTo.label}
          to={fallbackReturnTo.to}
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title={`Federal application ${federalApplicationDisplayNumber}`.trim()}
          subtitle="Check and manage this federal application"
          status={
            currentDetail ? (
              <StatusTag
                status={currentDetail.statusDescription ?? currentDetail.statusCode ?? ''}
                fallbackLabel="Not provided"
              />
            ) : undefined
          }
        />
      </Column>

      {loading && !currentDetail && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading federal application detail…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {detail && currentDetail && (
        <>
          {!!actionResult && (
            <Column
              sm={4}
              md={8}
              lg={16}
              className={actionResult.kind === 'error' ? 'detail-page-error' : undefined}
            >
              <ActionResultNotification
                result={actionResult}
                onClose={() => setActionResult(null)}
              />
            </Column>
          )}
          {federalApplicationLocked && (
            <Column sm={4} md={8} lg={16} className="detail-page-error">
              <InlineNotification
                className="detail-context-notification"
                kind="warning"
                title="Application locked"
                subtitle={
                  currentDetail.lockMessage ||
                  'This application is currently locked for editing by another user.'
                }
                lowContrast
                hideCloseButton
              />
            </Column>
          )}

          <Column
            sm={4}
            md={8}
            lg={16}
            className={`application-detail-tabs-column content-loading-region${
              isRefreshingDetail ? ' is-loading' : ''
            }`}
            inert={isRefreshingDetail ? true : undefined}
            aria-busy={isRefreshingDetail}
          >
            <ContentLoadingOverlay
              loading={isRefreshingDetail}
              loadingDescription="Refreshing federal application detail…"
            />
            <Tabs
              selectedIndex={selectedFederalApplicationTabIndex}
              onChange={({ selectedIndex }) => {
                sections.confirmLeave(() =>
                  selectFederalApplicationTab(
                    FEDERAL_APPLICATION_DETAIL_TAB_SLOTS[selectedIndex] ?? 'owner',
                  ),
                )
              }}
            >
              <TabList
                aria-label="Federal application detail sections"
                contained
                className="application-tabs__list application-detail-tab-list"
              >
                <Tab>Applicant</Tab>
                {hasAgent && <Tab>Agent</Tab>}
                <Tab>Application</Tab>
                <Tab>Items</Tab>
                {canViewFederalRemarks && <Tab>Remarks</Tab>}
              </TabList>
              <TabPanels>
                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Applicant"
                        fields={[
                          [
                            {
                              label: 'Contact name',
                              value: displayValue(detail.ownerContactName),
                            },
                            {
                              label: 'Applicant type',
                              value: displayValue(applicantTypeLabel(detail.ownerApplicantType)),
                            },
                          ],
                          [
                            {
                              label: 'Client',
                              span: 'wide',
                              value: displayValue(
                                [detail.ownerCompanyName?.trim(), detail.ownerClientNumber?.trim()]
                                  .filter(Boolean)
                                  .join(' · '),
                              ),
                            },
                            {
                              label: 'Client location',
                              value: displayValue(detail.ownerClientLocationCode),
                              span: 'wide',
                            },
                          ],
                          [
                            {
                              label: 'Address',
                              value: displayValue(detail.ownerClientContext?.address),
                              span: 'wide',
                            },
                            {
                              label: 'City',
                              value: displayValue(detail.ownerClientContext?.city),
                            },
                            {
                              label: 'Province',
                              value: displayValue(detail.ownerClientContext?.province),
                            },
                          ],
                          [
                            {
                              label: 'Country',
                              value: displayValue(detail.ownerClientContext?.country),
                            },
                            {
                              label: 'Postal code',
                              value: displayValue(detail.ownerClientContext?.postalCode),
                            },
                          ],
                          [
                            {
                              label: 'Phone number',
                              value: displayValue(detail.ownerClientContext?.phone),
                            },
                            {
                              label: 'Fax number',
                              value: displayValue(detail.ownerClientContext?.fax),
                            },
                            {
                              label: 'Email address',
                              value: displayValue(detail.ownerClientContext?.email),
                            },
                          ],
                        ]}
                      />
                    </Column>
                  </Grid>
                </TabPanel>

                {hasAgent && (
                  <TabPanel className="application-detail-tab-panel">
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        <DetailFieldTile
                          title="Agent"
                          fields={[
                            [
                              {
                                label: 'Contact name',
                                value: displayValue(detail.agentContactName),
                              },
                            ],
                            [
                              {
                                label: 'Client',
                                span: 'wide',
                                value: displayValue(
                                  [
                                    detail.agentCompanyName?.trim(),
                                    detail.agentClientNumber?.trim(),
                                  ]
                                    .filter(Boolean)
                                    .join(' · '),
                                ),
                              },
                              {
                                label: 'Client location',
                                value: displayValue(detail.agentClientLocationCode),
                                span: 'wide',
                              },
                            ],
                            [
                              {
                                label: 'Address',
                                value: displayValue(detail.agentClientContext?.address),
                                span: 'wide',
                              },
                              {
                                label: 'City',
                                value: displayValue(detail.agentClientContext?.city),
                              },
                              {
                                label: 'Province',
                                value: displayValue(detail.agentClientContext?.province),
                              },
                            ],
                            [
                              {
                                label: 'Country',
                                value: displayValue(detail.agentClientContext?.country),
                              },
                              {
                                label: 'Postal code',
                                value: displayValue(detail.agentClientContext?.postalCode),
                              },
                            ],
                            [
                              {
                                label: 'Phone number',
                                value: displayValue(detail.agentClientContext?.phone),
                              },
                              {
                                label: 'Fax number',
                                value: displayValue(detail.agentClientContext?.fax),
                              },
                              {
                                label: 'Email address',
                                value: displayValue(detail.agentClientContext?.email),
                              },
                            ],
                          ]}
                        />
                      </Column>
                    </Grid>
                  </TabPanel>
                )}

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Application"
                        headerAction={
                          canMutateFederalApplication &&
                          statusTransitions.length > 0 &&
                          !isEditingFederalStatus ? (
                            <HStack gap={4}>
                              {statusTransitions.map((transition) => (
                                <Button
                                  key={transition.code}
                                  ref={sections.editButtonRef(statusSectionFor(transition))}
                                  kind="tertiary"
                                  size="md"
                                  onClick={() =>
                                    sections.startEditing(statusSectionFor(transition), () => {
                                      setStatusRemark('')
                                      resetStatusFieldErrors()
                                      setActionResult(withoutActionError)
                                    })
                                  }
                                >
                                  {transition.actionLabel}
                                </Button>
                              ))}
                            </HStack>
                          ) : undefined
                        }
                        fields={[
                          [
                            {
                              label: 'Region',
                              value: displayValue(detail.region),
                              span: 'wide',
                            },
                            {
                              label: 'Product type',
                              value: displayValue(detail.productType),
                            },
                          ],
                          [
                            {
                              label: 'Application date',
                              value: displayValue(detail.applicationDate),
                            },
                            {
                              label: 'Received date',
                              value: displayValue(detail.receivedDate),
                            },
                            {
                              label: 'List date',
                              value: displayValue(detail.listingDate),
                            },
                          ],
                          [
                            {
                              label: 'Federal application number',
                              value: displayValue(detail.federalApplicationNumber),
                            },
                            {
                              label: 'Status',
                              value: (
                                <StatusTag
                                  status={detail.statusDescription ?? detail.statusCode ?? ''}
                                  fallbackLabel="Not provided"
                                />
                              ),
                            },
                            {
                              label: 'Author',
                              value: displayAuditIdentity(detail.author),
                            },
                          ],
                        ]}
                      />
                      {canMutateFederalApplication && editingStatusTransition && (
                        <Tile ref={sections.sectionRef(statusSectionFor(editingStatusTransition))}>
                          <h2 className="detail-tile-title">Update federal status</h2>
                          <RequiredFieldsLegend />
                          <RecordFieldGrid editing ref={statusFormRef}>
                            <RecordFieldRow>
                              <RecordField label="Status" value={editingStatusTransition.label} />
                            </RecordFieldRow>
                            <RecordFieldRow>
                              <RecordFieldCell span="full">
                                <TextArea
                                  id="federalApplicationStatusRemark"
                                  labelText={requiredLabel('Remark')}
                                  aria-required="true"
                                  enableCounter
                                  maxCount={250}
                                  value={statusRemark}
                                  {...statusInvalidProps('statusRemark')}
                                  onChange={(event) => {
                                    setStatusRemark(event.target.value)
                                    clearStatusFieldError('statusRemark')
                                  }}
                                />
                              </RecordFieldCell>
                            </RecordFieldRow>
                          </RecordFieldGrid>
                          <div className="legacy-search-actions">
                            <Button
                              kind="ghost"
                              size="md"
                              disabled={isSavingStatus}
                              onClick={sections.cancelEditing}
                            >
                              Cancel
                            </Button>
                            <Button
                              kind="primary"
                              size="md"
                              disabled={isSavingStatus}
                              renderIcon={isSavingStatus ? PendingIcon : undefined}
                              onClick={() => void onSaveStatus()}
                            >
                              {isSavingStatus ? 'Saving…' : 'Update status'}
                            </Button>
                          </div>
                        </Tile>
                      )}
                    </Column>
                  </Grid>
                </TabPanel>

                <TabPanel className="application-detail-tab-panel">
                  <Grid fullWidth className="application-detail-tab-grid">
                    <Column sm={4} md={8} lg={16}>
                      <DetailFieldTile
                        title="Items"
                        fields={[
                          [
                            {
                              label: 'Location of logs',
                              value: displayValue(detail.logLocation),
                            },
                          ],
                          [
                            {
                              label: 'Age class',
                              value: displayValue(detail.ageClass),
                            },
                          ],
                          [
                            {
                              label: 'Average log volume (m³)',
                              value: displayVolume(detail.averageLogVolume),
                            },
                            {
                              label: 'Application volume (m³)',
                              value: displayVolume(detail.applicationVolume),
                            },
                          ],
                          [
                            {
                              label: 'Species and end use sort',
                              value: displayValue(detail.endUse),
                            },
                          ],
                        ]}
                      />
                    </Column>
                    <Column sm={4} md={8} lg={16}>
                      <Tile>
                        <h2 className="detail-tile-title">Packages</h2>
                        {detail.packages.length > 0 ? (
                          <TableFrame ariaLabel="Federal application packages">
                            <Table size="md" useZebraStyles>
                              <TableHead>
                                <TableRow>
                                  <TableHeader>Package number</TableHeader>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {detail.packages.map((item) => (
                                  <TableRow key={item}>
                                    <TableCell>{item}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableFrame>
                        ) : (
                          <p className="detail-empty-message">
                            No package has been recorded for this federal application.
                          </p>
                        )}
                      </Tile>
                    </Column>
                    {/* INTENTIONAL_LEGACY_DIVERGENCE(PACKAGE_FIRST_ITEMS_WORKFLOW):
                        Suppress dependent Summary of scale content until a package exists. */}
                    {detail.packages.length > 0 && (
                      <Column sm={4} md={8} lg={16}>
                        <Tile>
                          <h2 className="detail-tile-title">Summary of scale</h2>
                          {scaleErrorMessage ? (
                            <EmptyState
                              title="Scale details unavailable"
                              description={scaleErrorMessage}
                              headingLevel={3}
                              role="alert"
                            />
                          ) : scaleRows.length > 0 ? (
                            <TableFrame ariaLabel="Federal application scale details">
                              <Table size="md" useZebraStyles>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Package</TableHeader>
                                    <TableHeader>Timber mark</TableHeader>
                                    <TableHeader>Pieces</TableHeader>
                                    <TableHeader>Species</TableHeader>
                                    <TableHeader>Grade</TableHeader>
                                    <TableHeader>Volume (m³)</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {scaleRows.map((row) => (
                                    <TableRow key={`${row.packageNumber}-${row.id}`}>
                                      <TableCell>{row.packageNumber}</TableCell>
                                      <TableCell>{displayTableValue(row.timberMark)}</TableCell>
                                      <TableCell>{row.pieces.toLocaleString()}</TableCell>
                                      <TableCell>{displayTableValue(row.species)}</TableCell>
                                      <TableCell>{displayTableValue(row.grade)}</TableCell>
                                      <TableCell>{displayVolume(row.volume)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableFrame>
                          ) : (
                            <EmptyState
                              title="No scale details found"
                              description="No scale details are recorded for this federal application."
                              headingLevel={3}
                            />
                          )}
                        </Tile>
                      </Column>
                    )}
                  </Grid>
                </TabPanel>

                {canViewFederalRemarks && (
                  <TabPanel
                    className={`application-detail-tab-panel${
                      federalRemarksEmpty ? ' application-detail-tab-panel--empty' : ''
                    }`}
                  >
                    <Grid fullWidth className="application-detail-tab-grid">
                      <Column sm={4} md={8} lg={16}>
                        {federalRemarksEmpty ? (
                          <EmptyState
                            title="No remarks found"
                            description="No remarks have been added to this federal application."
                            action={addFederalRemarkButton}
                            headingLevel={2}
                            variant="tab"
                          />
                        ) : (
                          <Tile
                            ref={
                              editingRemarkSection
                                ? sections.sectionRef(editingRemarkSection)
                                : undefined
                            }
                            className="application-detail-section application-detail-remarks"
                          >
                            <div className="detail-section-card__header">
                              <h2 className="detail-tile-title">Remarks</h2>
                              {addFederalRemarkButton}
                            </div>
                            {canManageFederalRemarks && isEditingFederalRemarks && (
                              <div ref={remarkFormRef} className="legacy-search-actions">
                                <TextArea
                                  id="federalApplicationRemark"
                                  labelText={requiredLabel(
                                    editingRemarkId
                                      ? `Edit remark ${editingRemarkId}`
                                      : 'New remark',
                                  )}
                                  aria-required="true"
                                  enableCounter
                                  maxCount={250}
                                  value={remarkDraft}
                                  invalid={!!remarkValidationMessage}
                                  invalidText={fieldErrorText(remarkValidationMessage)}
                                  onChange={(event) => {
                                    setRemarkDraft(event.target.value)
                                    if (remarkValidationMessage) {
                                      setRemarkValidationMessage('')
                                    }
                                  }}
                                />
                                <Button
                                  kind="ghost"
                                  size="md"
                                  disabled={isSavingRemark}
                                  onClick={sections.cancelEditing}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  kind="primary"
                                  size="md"
                                  disabled={isSavingRemark}
                                  renderIcon={isSavingRemark ? PendingIcon : undefined}
                                  onClick={() => void onSaveRemark()}
                                >
                                  {isSavingRemark
                                    ? 'Saving…'
                                    : editingRemarkId
                                      ? 'Update remark'
                                      : 'Save remark'}
                                </Button>
                              </div>
                            )}
                            {remarksErrorMessage ? (
                              <EmptyState
                                title="Remarks unavailable"
                                description={remarksErrorMessage}
                                headingLevel={3}
                                role="alert"
                              />
                            ) : remarkRows.length > 0 ? (
                              <TableFrame ariaLabel="Federal application remarks">
                                <Table size="md" useZebraStyles>
                                  <TableHead>
                                    <TableRow>
                                      <TableHeader>Date and time</TableHeader>
                                      <TableHeader>User</TableHeader>
                                      <TableHeader>Remark</TableHeader>
                                      {canManageFederalRemarks && (
                                        <TableHeader>Actions</TableHeader>
                                      )}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {remarkRows.map((item) => (
                                      <TableRow key={item.remarkId}>
                                        <TableCell>
                                          {formatBusinessDateTimeLabel(item.date)}
                                        </TableCell>
                                        <TableCell>{displayValue(item.user)}</TableCell>
                                        <TableCell>{item.remark}</TableCell>
                                        {canManageFederalRemarks && (
                                          <TableCell>
                                            <Button
                                              ref={sections.editButtonRef(
                                                `remark-${item.remarkId}`,
                                              )}
                                              kind="ghost"
                                              size="md"
                                              onClick={() =>
                                                sections.startEditing(
                                                  `remark-${item.remarkId}`,
                                                  () => {
                                                    setEditingRemarkId(item.remarkId)
                                                    setRemarkDraft(item.remark)
                                                    setRemarkValidationMessage('')
                                                  },
                                                )
                                              }
                                            >
                                              Edit
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableFrame>
                            ) : (
                              <EmptyState
                                title="No remarks found"
                                description="No remarks have been added to this federal application."
                                headingLevel={3}
                              />
                            )}
                          </Tile>
                        )}
                      </Column>
                    </Grid>
                  </TabPanel>
                )}
              </TabPanels>
            </Tabs>
          </Column>
        </>
      )}
      <UnsavedChangesGuard
        isDirty={isFederalApplicationDirty}
        isBusy={isFederalApplicationBusy}
        onDiscard={onDiscardFederalApplicationChanges}
        subject="this federal application"
      />
      {sections.discardModal}
    </Grid>
  )
}

export default FederalApplicationDetailsPage
