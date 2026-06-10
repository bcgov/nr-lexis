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
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/auth/useAuth'
import type { ProvincialApplicationDetail } from '@/interfaces/LexisDetails'
import { DetailFieldTile } from '@/pages/shared/DetailSections'
import { useLatestRequestGuard } from '@/pages/shared/useLatestRequestGuard'
import { fetchProvincialApplicationDetail } from '@/service/lexis-detail-service'
import {
  fetchApplicationDocuments,
  openApplicationDocument,
  removeApplicationDocument,
  type ProvincialApplicationDocumentRow,
} from '@/service/provincial-application-documents-service'
import {
  fetchApplicationSummarySnapshot,
  saveApplicationRemark,
  updateApplicationSummary,
  type ApplicationSummarySnapshot,
} from '@/service/provincial-application-items-service'
import { submitAdminUpload } from '@/service/admin-upload-service'
import ProvincialApplicationItemsPanel from './ApplicationItemsPanel'

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

type ApplicationSummaryFormState = {
  applicationDate: string
  receivedDate: string
  termDays: string
  applicationVolume: string
  averageLogVolume: string
  exemptionReasonCode: string
  productLocation: string
  exportScheduleId: string
  agentClientNumber: string
  agentClientLocationCode: string
  ownerClientNumber: string
  ownerClientLocationCode: string
  applicationStatusCode: string
  applicantTypeCode: string
  orgUnitNumber: string
  productTypeCode: string
  jurisdictionCode: string
  growthTypeCode: string
  agentContactName: string
  ownerContactName: string
  oicIndicator: string
}

const toSummaryFormState = (detail: ProvincialApplicationDetail): ApplicationSummaryFormState => ({
  applicationDate: detail.applicationDate ?? '',
  receivedDate: detail.receivedDate ?? '',
  termDays: detail.termDays === null ? '' : String(detail.termDays),
  applicationVolume: detail.applicationVolume === null ? '' : String(detail.applicationVolume),
  averageLogVolume: detail.averageLogVolume === null ? '' : String(detail.averageLogVolume),
  exemptionReasonCode: detail.exemptionReasonCode ?? '',
  productLocation: '',
  exportScheduleId: '',
  agentClientNumber: detail.agentClientNumber ?? '',
  agentClientLocationCode: '',
  ownerClientNumber: detail.ownerClientNumber ?? '',
  ownerClientLocationCode: '',
  applicationStatusCode: detail.applicationStatusCode ?? '',
  applicantTypeCode: detail.agentClientNumber ? 'A' : 'O',
  orgUnitNumber: detail.orgUnitNumber === null ? '' : String(detail.orgUnitNumber),
  productTypeCode: detail.productTypeCode ?? '',
  jurisdictionCode: 'P',
  growthTypeCode: '',
  agentContactName: '',
  ownerContactName: '',
  oicIndicator: 'N',
})

const toSummarySnapshotFormState = (
  snapshot: ApplicationSummarySnapshot,
): ApplicationSummaryFormState => ({
  applicationDate: snapshot.applicationDate,
  receivedDate: snapshot.receivedDate,
  termDays: snapshot.termDays,
  applicationVolume: snapshot.applicationVolume,
  averageLogVolume: snapshot.averageLogVolume,
  exemptionReasonCode: snapshot.exemptionReasonCode,
  productLocation: snapshot.productLocation,
  exportScheduleId: snapshot.exportScheduleId,
  agentClientNumber: snapshot.agentClientNumber,
  agentClientLocationCode: snapshot.agentClientLocationCode,
  ownerClientNumber: snapshot.ownerClientNumber,
  ownerClientLocationCode: snapshot.ownerClientLocationCode,
  applicationStatusCode: snapshot.applicationStatusCode,
  applicantTypeCode: snapshot.applicantTypeCode,
  orgUnitNumber: snapshot.orgUnitNumber,
  productTypeCode: snapshot.productTypeCode,
  jurisdictionCode: snapshot.jurisdictionCode,
  growthTypeCode: snapshot.growthTypeCode,
  agentContactName: snapshot.agentContactName,
  ownerContactName: snapshot.ownerContactName,
  oicIndicator: snapshot.oicIndicator,
})

const ProvincialApplicationDetailsPage: FC = () => {
  const navigate = useNavigate()
  const { canPerform } = useAuth()
  const { applicationNumber } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProvincialApplicationDetail | null>(null)
  const [documentRows, setDocumentRows] = useState<ProvincialApplicationDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [documentsErrorMessage, setDocumentsErrorMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const [actionInfoMessage, setActionInfoMessage] = useState('')
  const [isRemovingDocumentId, setIsRemovingDocumentId] = useState<string | null>(null)
  const [selectedApplicationDocumentFile, setSelectedApplicationDocumentFile] =
    useState<File | null>(null)
  const [applicationDocumentDescription, setApplicationDocumentDescription] = useState('')
  const [applicationDocumentValidationMessage, setApplicationDocumentValidationMessage] =
    useState('')
  const [isUploadingApplicationDocument, setIsUploadingApplicationDocument] = useState(false)
  const [applicationDocumentUploadInputKey, setApplicationDocumentUploadInputKey] = useState(0)
  const [remarkBody, setRemarkBody] = useState('')
  const [isSavingRemark, setIsSavingRemark] = useState(false)
  const [remarkValidationMessage, setRemarkValidationMessage] = useState('')
  const [summaryForm, setSummaryForm] = useState<ApplicationSummaryFormState | null>(null)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
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

  const loadApplicationDetail = useCallback(async () => {
    const isLatestRequest = beginDetailRequest()
    if (!applicationNumber) {
      setErrorMessage('Application number is missing from the route.')
      setDetail(null)
      setDocumentRows([])
      setDocumentsErrorMessage('')
      setActionErrorMessage('')
      setActionInfoMessage('')
      setLoading(false)
      setSummaryForm(null)
      return
    }

    setLoading(true)
    setErrorMessage('')
    setDocumentsErrorMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const response = await fetchProvincialApplicationDetail(applicationNumber)
      if (!isLatestRequest()) {
        return
      }
      setDetail(response)
      setSummaryForm(response ? toSummaryFormState(response) : null)
      if (!response) {
        setErrorMessage(`No provincial application found for ${applicationNumber}.`)
        setDocumentRows([])
        return
      }

      if (canPerform('createApplication') && !response.readOnly && !response.locked) {
        try {
          const summarySnapshot = await fetchApplicationSummarySnapshot(applicationNumber)
          if (isLatestRequest() && summarySnapshot) {
            setSummaryForm(toSummarySnapshotFormState(summarySnapshot))
          }
        } catch (error) {
          if (isLatestRequest()) {
            console.error(error)
            setActionErrorMessage('Unable to retrieve editable application summary fields.')
          }
        }
      }

      try {
        const documentsResult = await fetchApplicationDocuments(applicationNumber)
        if (isLatestRequest()) {
          setDocumentRows(documentsResult.rows)
        }
      } catch (error) {
        if (isLatestRequest()) {
          console.error(error)
          setDocumentRows([])
          setDocumentsErrorMessage('Unable to retrieve application documents.')
        }
      }
    } catch (error) {
      if (isLatestRequest()) {
        console.error(error)
        setErrorMessage('Unable to retrieve provincial application detail.')
        setDetail(null)
        setSummaryForm(null)
        setDocumentRows([])
        setDocumentsErrorMessage('')
      }
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [applicationNumber, beginDetailRequest, canPerform])

  useEffect(() => {
    void loadApplicationDetail()
  }, [loadApplicationDetail])

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
  const canManageItems = canPerform('createApplication') && !detail?.readOnly && !detail?.locked
  const canManageRemarks = canManageItems
  const canEditSummary = canManageItems

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
    setActionErrorMessage('')
    setActionInfoMessage('')
    const params = new URLSearchParams({
      type: 'application',
      applicationNumber: String(detail.applicationNumber),
    })
    navigate(`/admin/uploads?${params.toString()}`)
  }, [detail, navigate])

  const onOpenDocument = useCallback(async (row: ProvincialApplicationDocumentRow) => {
    setActionErrorMessage('')
    setActionInfoMessage('')

    try {
      const result = await openApplicationDocument(row.id, row.name)
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

      const isLatestRequest = beginDetailRequest()
      setIsRemovingDocumentId(row.id)
      setActionErrorMessage('')
      setActionInfoMessage('')

      try {
        const removeResult = await removeApplicationDocument(row.id)
        if (!isLatestRequest()) {
          return
        }
        if (!removeResult.success) {
          setActionErrorMessage('Document removal failed. Refresh and try again.')
          return
        }

        const documentsResult = await fetchApplicationDocuments(applicationNumber)
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

  const onUploadApplicationDocument = useCallback(async () => {
    if (!applicationNumber || !detail) {
      return
    }

    if (!selectedApplicationDocumentFile) {
      setApplicationDocumentValidationMessage('Choose a file to upload.')
      return
    }

    setApplicationDocumentValidationMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsUploadingApplicationDocument(true)

    try {
      await submitAdminUpload('application', {
        applicationNumber: String(detail.applicationNumber),
        file: selectedApplicationDocumentFile,
        fileDescription: applicationDocumentDescription.trim(),
      })

      const documentsResult = await fetchApplicationDocuments(applicationNumber)
      setDocumentRows(documentsResult.rows)
      setSelectedApplicationDocumentFile(null)
      setApplicationDocumentDescription('')
      setApplicationDocumentUploadInputKey((current) => current + 1)
      setActionInfoMessage('Application document uploaded.')
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to upload application document.')
    } finally {
      setIsUploadingApplicationDocument(false)
    }
  }, [applicationDocumentDescription, applicationNumber, detail, selectedApplicationDocumentFile])

  const onSaveRemark = useCallback(async () => {
    if (!applicationNumber || !detail) {
      return
    }

    const normalizedRemark = remarkBody.trim()
    if (!normalizedRemark) {
      setRemarkValidationMessage('Remark is required.')
      return
    }

    setRemarkValidationMessage('')
    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingRemark(true)
    try {
      const result = await saveApplicationRemark({
        applicationNumber: String(detail.applicationNumber),
        remarkBody: normalizedRemark,
      })
      if (!result.success) {
        setActionErrorMessage('Unable to save application remark.')
        return
      }

      await loadApplicationDetail()
      setRemarkBody('')
      setActionInfoMessage('Application remark saved.')
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save application remark.')
    } finally {
      setIsSavingRemark(false)
    }
  }, [applicationNumber, detail, loadApplicationDetail, remarkBody])

  const onSummaryFormChange = useCallback(
    (key: keyof ApplicationSummaryFormState, value: string) => {
      setSummaryForm((current) => (current ? { ...current, [key]: value } : current))
    },
    [],
  )

  const onSaveSummary = useCallback(async () => {
    if (!applicationNumber || !detail || !summaryForm) {
      return
    }

    setActionErrorMessage('')
    setActionInfoMessage('')
    setIsSavingSummary(true)
    try {
      const result = await updateApplicationSummary({
        applicationNumber: String(detail.applicationNumber),
        applicationDate: summaryForm.applicationDate,
        receivedDate: summaryForm.receivedDate,
        termDays: summaryForm.termDays,
        applicationVolume: summaryForm.applicationVolume,
        averageLogVolume: summaryForm.averageLogVolume,
        exemptionReasonCode: summaryForm.exemptionReasonCode,
        productLocation: summaryForm.productLocation,
        exportScheduleId: summaryForm.exportScheduleId,
        agentClientNumber: summaryForm.agentClientNumber,
        agentClientLocationCode: summaryForm.agentClientLocationCode,
        ownerClientNumber: summaryForm.ownerClientNumber,
        ownerClientLocationCode: summaryForm.ownerClientLocationCode,
        applicationStatusCode: summaryForm.applicationStatusCode,
        applicantTypeCode: summaryForm.applicantTypeCode,
        orgUnitNumber: summaryForm.orgUnitNumber,
        productTypeCode: summaryForm.productTypeCode,
        jurisdictionCode: summaryForm.jurisdictionCode,
        growthTypeCode: summaryForm.growthTypeCode,
        agentContactName: summaryForm.agentContactName,
        ownerContactName: summaryForm.ownerContactName,
        oicIndicator: summaryForm.oicIndicator,
      })
      if (!result.valid) {
        setActionErrorMessage(
          result.errors.length > 0
            ? result.errors.join(' ')
            : result.message || 'Unable to save application summary.',
        )
        return
      }

      await loadApplicationDetail()
      setActionInfoMessage(result.message || 'Application summary saved.')
    } catch (error) {
      console.error(error)
      setActionErrorMessage('Unable to save application summary.')
    } finally {
      setIsSavingSummary(false)
    }
  }, [applicationNumber, detail, loadApplicationDetail, summaryForm])

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
            <Tile>
              <h2 className="detail-tile-title">Application Summary</h2>
              <dl className="detail-field-grid">
                {[
                  ['Application Number', displayValue(detail.applicationNumber)],
                  ['Exemption Number', displayValue(detail.exemptionNumber)],
                  [
                    'Status',
                    displayValue(detail.statusDescription ?? detail.applicationStatusCode),
                  ],
                  ['Product Type', displayValue(detail.productTypeCode)],
                  ['Owner Client Number', displayValue(detail.ownerClientNumber)],
                  ['Agent Client Number', displayValue(detail.agentClientNumber)],
                  ['Org Unit', displayValue(detail.orgUnitName ?? detail.orgUnitNumber)],
                  ['Listing Date', displayValue(detail.listingDate)],
                ].map(([label, value]) => (
                  <div key={label} className="detail-field-item">
                    <dt className="detail-field-label">{label}</dt>
                    <dd className="detail-field-value">{value}</dd>
                  </div>
                ))}
              </dl>
              {canEditSummary && summaryForm ? (
                <>
                  <div className="legacy-search-grid">
                    <TextInput
                      id="applicationSummaryExemptionReason"
                      labelText="Exemption Reason"
                      maxLength={1}
                      value={summaryForm.exemptionReasonCode}
                      onChange={(event) =>
                        onSummaryFormChange('exemptionReasonCode', event.target.value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummaryApplicationDate"
                      labelText="Application Date"
                      type="date"
                      value={summaryForm.applicationDate}
                      onChange={(event) =>
                        onSummaryFormChange('applicationDate', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryReceivedDate"
                      labelText="Received Date"
                      type="date"
                      value={summaryForm.receivedDate}
                      onChange={(event) => onSummaryFormChange('receivedDate', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryTermDays"
                      labelText="Term (days)"
                      type="number"
                      min={1}
                      value={summaryForm.termDays}
                      onChange={(event) => onSummaryFormChange('termDays', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryVolume"
                      labelText="Application Volume (m³)"
                      type="number"
                      min={0}
                      step="0.1"
                      value={summaryForm.applicationVolume}
                      onChange={(event) =>
                        onSummaryFormChange('applicationVolume', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryAverageLogVolume"
                      labelText="Average Log Volume"
                      type="number"
                      min={0}
                      step="0.1"
                      value={summaryForm.averageLogVolume}
                      onChange={(event) =>
                        onSummaryFormChange('averageLogVolume', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryOwnerClientNumber"
                      labelText="Owner Client Number"
                      value={summaryForm.ownerClientNumber}
                      onChange={(event) =>
                        onSummaryFormChange('ownerClientNumber', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryOwnerClientLocationCode"
                      labelText="Owner Client Location"
                      maxLength={2}
                      value={summaryForm.ownerClientLocationCode}
                      onChange={(event) =>
                        onSummaryFormChange(
                          'ownerClientLocationCode',
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                    <TextInput
                      id="applicationSummaryOwnerContactName"
                      labelText="Owner Contact Name"
                      value={summaryForm.ownerContactName}
                      onChange={(event) =>
                        onSummaryFormChange('ownerContactName', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryApplicantTypeCode"
                      labelText="Applicant Type"
                      maxLength={1}
                      value={summaryForm.applicantTypeCode}
                      onChange={(event) =>
                        onSummaryFormChange('applicantTypeCode', event.target.value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummaryAgentClientNumber"
                      labelText="Agent Client Number"
                      value={summaryForm.agentClientNumber}
                      onChange={(event) =>
                        onSummaryFormChange('agentClientNumber', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryAgentClientLocationCode"
                      labelText="Agent Client Location"
                      maxLength={2}
                      value={summaryForm.agentClientLocationCode}
                      onChange={(event) =>
                        onSummaryFormChange(
                          'agentClientLocationCode',
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                    <TextInput
                      id="applicationSummaryAgentContactName"
                      labelText="Agent Contact Name"
                      value={summaryForm.agentContactName}
                      onChange={(event) =>
                        onSummaryFormChange('agentContactName', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryRegion"
                      labelText="Region"
                      type="number"
                      min={1}
                      value={summaryForm.orgUnitNumber}
                      onChange={(event) => onSummaryFormChange('orgUnitNumber', event.target.value)}
                    />
                    <TextInput
                      id="applicationSummaryProductType"
                      labelText="Product Type"
                      value={summaryForm.productTypeCode}
                      onChange={(event) =>
                        onSummaryFormChange('productTypeCode', event.target.value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummaryGrowthType"
                      labelText="Growth Type"
                      value={summaryForm.growthTypeCode}
                      onChange={(event) =>
                        onSummaryFormChange('growthTypeCode', event.target.value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummaryStatus"
                      labelText="Application Status"
                      value={summaryForm.applicationStatusCode}
                      onChange={(event) =>
                        onSummaryFormChange(
                          'applicationStatusCode',
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                    <TextInput
                      id="applicationSummaryJurisdiction"
                      labelText="Jurisdiction"
                      maxLength={1}
                      value={summaryForm.jurisdictionCode}
                      onChange={(event) =>
                        onSummaryFormChange('jurisdictionCode', event.target.value.toUpperCase())
                      }
                    />
                    <TextInput
                      id="applicationSummarySchedule"
                      labelText="Schedule ID"
                      type="number"
                      min={1}
                      value={summaryForm.exportScheduleId}
                      onChange={(event) =>
                        onSummaryFormChange('exportScheduleId', event.target.value)
                      }
                    />
                    <TextInput
                      id="applicationSummaryOicIndicator"
                      labelText="OIC Indicator"
                      maxLength={1}
                      value={summaryForm.oicIndicator}
                      onChange={(event) =>
                        onSummaryFormChange('oicIndicator', event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div className="legacy-search-grid">
                    <TextArea
                      id="applicationSummaryProductLocation"
                      labelText="Location of Logs"
                      value={summaryForm.productLocation}
                      onChange={(event) =>
                        onSummaryFormChange('productLocation', event.target.value)
                      }
                    />
                  </div>
                  <div className="legacy-search-actions">
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={isSavingSummary}
                      onClick={() => void onSaveSummary()}
                    >
                      {isSavingSummary ? 'Saving...' : 'Save Summary'}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      disabled={isSavingSummary}
                      onClick={() => setSummaryForm(toSummaryFormState(detail))}
                    >
                      Reset Summary
                    </Button>
                  </div>
                </>
              ) : (
                <dl className="detail-field-grid">
                  {[
                    ['Exemption Reason', displayValue(detail.exemptionReasonCode)],
                    ['Application Date', displayValue(detail.applicationDate)],
                    ['Received Date', displayValue(detail.receivedDate)],
                    ['Term (days)', displayValue(detail.termDays)],
                    ['Application Volume (m³)', displayValue(detail.applicationVolume)],
                    ['Average Log Volume', displayValue(detail.averageLogVolume)],
                  ].map(([label, value]) => (
                    <div key={label} className="detail-field-item">
                      <dt className="detail-field-label">{label}</dt>
                      <dd className="detail-field-value">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Tile>
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
          <Column sm={4} md={8} lg={16}>
            <ProvincialApplicationItemsPanel
              detail={detail}
              canManageItems={canManageItems}
              onDetailChanged={loadApplicationDetail}
            />
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
                Documents <Tag type="green">API</Tag>
              </h2>
              {canManageDocuments && (
                <div className="legacy-search-grid">
                  <TextInput
                    key={applicationDocumentUploadInputKey}
                    id="applicationDocumentUploadFile"
                    type="file"
                    labelText="Application Document File"
                    invalid={!!applicationDocumentValidationMessage}
                    invalidText={applicationDocumentValidationMessage}
                    onChange={(event) => {
                      const target = event.target as HTMLInputElement
                      setSelectedApplicationDocumentFile(target.files?.[0] ?? null)
                      if (applicationDocumentValidationMessage) {
                        setApplicationDocumentValidationMessage('')
                      }
                    }}
                  />
                  <TextArea
                    id="applicationDocumentUploadDescription"
                    labelText="Document Description"
                    value={applicationDocumentDescription}
                    onChange={(event) => setApplicationDocumentDescription(event.target.value)}
                  />
                  <div className="legacy-search-actions">
                    <Button
                      kind="primary"
                      size="sm"
                      disabled={isUploadingApplicationDocument}
                      onClick={() => void onUploadApplicationDocument()}
                    >
                      {isUploadingApplicationDocument ? 'Uploading...' : 'Upload Document'}
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={isUploadingApplicationDocument}
                      onClick={() => {
                        setSelectedApplicationDocumentFile(null)
                        setApplicationDocumentDescription('')
                        setApplicationDocumentValidationMessage('')
                        setApplicationDocumentUploadInputKey((current) => current + 1)
                      }}
                    >
                      Reset Upload
                    </Button>
                  </div>
                </div>
              )}
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
              {canManageRemarks && (
                <div className="legacy-search-actions">
                  <TextArea
                    id="applicationRemarkBody"
                    labelText="New Remark"
                    value={remarkBody}
                    invalid={!!remarkValidationMessage}
                    invalidText={remarkValidationMessage}
                    onChange={(event) => {
                      setRemarkBody(event.target.value)
                      if (remarkValidationMessage) {
                        setRemarkValidationMessage('')
                      }
                    }}
                  />
                  <Button
                    kind="primary"
                    size="sm"
                    disabled={isSavingRemark}
                    onClick={() => void onSaveRemark()}
                  >
                    {isSavingRemark ? 'Saving...' : 'Save Remark'}
                  </Button>
                </div>
              )}
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
