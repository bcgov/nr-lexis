import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
  InlineLoading,
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
import { useAuth } from '@/context/auth/useAuth'
import { AppNotification } from '@/components/AppNotification'
import {
  firstValidationError,
  getVisibleFieldError,
  isoDateFieldError,
  numericFieldError,
  requiredFieldError,
  type FieldErrors,
  type TouchedFields,
} from '@/pages/shared/create-form-utils'
import {
  deleteFeePolicy as deleteFeePolicyRequest,
  deleteFilPolicy as deleteFilPolicyRequest,
  fetchFeePolicies,
  fetchFilPolicies,
  type FeePolicyRow,
  type FilPolicyRow,
  upsertFeePolicy as upsertFeePolicyRequest,
  upsertFilPolicy as upsertFilPolicyRequest,
} from '@/service/admin-policy-service'
import IsoDatePicker from '@/components/IsoDatePicker'
import { getResponseStatus } from '@/utils/http-error'

type PolicyField =
  | 'feeEffectiveDate'
  | 'feeOrgUnitCode'
  | 'feePolicyPercentage'
  | 'filEffectiveDate'
  | 'filPolicyPercentage'

const AdminPoliciesPage: FC = () => {
  const { canPerform } = useAuth()
  const canManageFeePolicy = canPerform('/lexisPolicyAdmin')
  const canManageFilPolicy = canPerform('/lexisFILAdmin')

  const [feePolicies, setFeePolicies] = useState<FeePolicyRow[]>([])
  const [filPolicies, setFilPolicies] = useState<FilPolicyRow[]>([])

  const [feeEffectiveDate, setFeeEffectiveDate] = useState('')
  const [feeOrgUnitCode, setFeeOrgUnitCode] = useState('')
  const [feeOrgUnitName, setFeeOrgUnitName] = useState('')
  const [feePolicyPercentage, setFeePolicyPercentage] = useState('')
  const [editingFeePolicyId, setEditingFeePolicyId] = useState<string | null>(null)

  const [filEffectiveDate, setFilEffectiveDate] = useState('')
  const [filPolicyPercentage, setFilPolicyPercentage] = useState('')
  const [editingFilPolicyId, setEditingFilPolicyId] = useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(true)
  const [isMutatingPolicies, setIsMutatingPolicies] = useState(false)
  const [touchedFields, setTouchedFields] = useState<TouchedFields<PolicyField>>({})
  const [showFeeValidationErrors, setShowFeeValidationErrors] = useState(false)
  const [showFilValidationErrors, setShowFilValidationErrors] = useState(false)

  const feePolicyCount = useMemo(() => feePolicies.length, [feePolicies.length])
  const filPolicyCount = useMemo(() => filPolicies.length, [filPolicies.length])
  const fieldErrors = useMemo<FieldErrors<PolicyField>>(
    () => ({
      feeEffectiveDate:
        firstValidationError(
          () => requiredFieldError(feeEffectiveDate, 'Policy effective date'),
          () => isoDateFieldError(feeEffectiveDate),
        ) ?? undefined,
      feeOrgUnitCode: requiredFieldError(feeOrgUnitCode, 'Region code') ?? undefined,
      feePolicyPercentage: firstValidationError(
        () => requiredFieldError(feePolicyPercentage, 'Fee increase percentage'),
        () => numericFieldError(feePolicyPercentage, 'Fee policy percentage'),
      ),
      filEffectiveDate:
        firstValidationError(
          () => requiredFieldError(filEffectiveDate, 'Policy effective date'),
          () => isoDateFieldError(filEffectiveDate),
        ) ?? undefined,
      filPolicyPercentage: firstValidationError(
        () => requiredFieldError(filPolicyPercentage, 'Fee in lieu percentage'),
        () => numericFieldError(filPolicyPercentage, 'Fee in lieu policy percentage'),
      ),
    }),
    [feeEffectiveDate, feeOrgUnitCode, feePolicyPercentage, filEffectiveDate, filPolicyPercentage],
  )

  const feeHasValidationError = Boolean(
    fieldErrors.feeEffectiveDate || fieldErrors.feeOrgUnitCode || fieldErrors.feePolicyPercentage,
  )
  const filHasValidationError = Boolean(
    fieldErrors.filEffectiveDate || fieldErrors.filPolicyPercentage,
  )

  const markFieldTouched = (field: PolicyField): void => {
    setTouchedFields((current) => ({ ...current, [field]: true }))
  }

  const feeFieldError = (field: PolicyField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showFeeValidationErrors)

  const filFieldError = (field: PolicyField): string | undefined =>
    getVisibleFieldError(field, fieldErrors, touchedFields, showFilValidationErrors)

  const clearNotifications = (): void => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const resetFeeForm = (): void => {
    setFeeEffectiveDate('')
    setFeeOrgUnitCode('')
    setFeeOrgUnitName('')
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

  const loadPolicies = useCallback(async () => {
    setIsLoadingPolicies(true)
    clearNotifications()

    try {
      const loadedFeePolicies = await fetchFeePolicies()
      const loadedFilPolicies = await fetchFilPolicies()
      setFeePolicies(loadedFeePolicies)
      setFilPolicies(loadedFilPolicies)
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
  }, [])

  useEffect(() => {
    void loadPolicies()
  }, [loadPolicies])

  const upsertFeePolicy = async (): Promise<void> => {
    clearNotifications()

    if (!canManageFeePolicy) {
      setErrorMessage('Your session does not include /lexisPolicyAdmin.')
      return
    }

    if (feeHasValidationError) {
      setShowFeeValidationErrors(true)
      setErrorMessage('Fee policy requires effective date, region code, and percentage.')
      return
    }

    setIsMutatingPolicies(true)

    try {
      const updatedRows = await upsertFeePolicyRequest({
        id: editingFeePolicyId,
        effectiveDate: feeEffectiveDate,
        orgUnitCode: feeOrgUnitCode,
        orgUnitName: feeOrgUnitName,
        policyPercentage: feePolicyPercentage,
      })
      setFeePolicies(updatedRows)
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
    setFeeEffectiveDate(row.effectiveDate)
    setFeeOrgUnitCode(row.orgUnitCode)
    setFeeOrgUnitName(row.orgUnitName)
    setFeePolicyPercentage(row.policyPercentage)
    setEditingFeePolicyId(row.id)
    setShowFeeValidationErrors(false)
    clearNotifications()
  }

  const deleteFeePolicy = async (rowId: string): Promise<void> => {
    clearNotifications()
    setIsMutatingPolicies(true)

    try {
      const updatedRows = await deleteFeePolicyRequest(rowId)
      setFeePolicies(updatedRows)
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
      const updatedRows = await upsertFilPolicyRequest({
        id: editingFilPolicyId,
        effectiveDate: filEffectiveDate,
        filPercentage: filPolicyPercentage,
      })
      setFilPolicies(updatedRows)
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
      const updatedRows = await deleteFilPolicyRequest(rowId)
      setFilPolicies(updatedRows)
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

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Policy center</h1>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <div>
            Fee policy access:{' '}
            <Tag type={canManageFeePolicy ? 'green' : 'red'}>
              {canManageFeePolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </div>
          <div>
            Fee in lieu policy access:{' '}
            <Tag type={canManageFilPolicy ? 'green' : 'red'}>
              {canManageFilPolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </div>
          {isLoadingPolicies && <InlineLoading description="Loading policy data..." />}
          {successMessage && (
            <AppNotification
              kind="success"
              title="Policy update"
              subtitle={successMessage}
              lowContrast
              autoDismissMs={8000}
              onCloseButtonClick={() => setSuccessMessage('')}
            />
          )}
          {errorMessage && (
            <AppNotification
              kind="error"
              title="Policy error"
              subtitle={errorMessage}
              lowContrast
              onCloseButtonClick={() => setErrorMessage('')}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Fee policy administration</h2>
          <p>
            Records: <strong>{feePolicyCount}</strong>
          </p>
          <div className="legacy-search-grid">
            <IsoDatePicker
              id="feeEffectiveDate"
              labelText="Policy effective date"
              value={feeEffectiveDate}
              invalid={!!feeFieldError('feeEffectiveDate')}
              invalidText={feeFieldError('feeEffectiveDate')}
              onBlur={() => markFieldTouched('feeEffectiveDate')}
              onChange={setFeeEffectiveDate}
            />
            <TextInput
              id="feeOrgUnitCode"
              labelText="Region code"
              value={feeOrgUnitCode}
              invalid={!!feeFieldError('feeOrgUnitCode')}
              invalidText={feeFieldError('feeOrgUnitCode')}
              onBlur={() => markFieldTouched('feeOrgUnitCode')}
              onChange={(event) => setFeeOrgUnitCode(event.target.value)}
            />
            <TextInput
              id="feeOrgUnitName"
              labelText="Region name"
              value={feeOrgUnitName}
              onChange={(event) => setFeeOrgUnitName(event.target.value)}
            />
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
          <div className="legacy-search-actions">
            <Button
              kind="primary"
              onClick={() => void upsertFeePolicy()}
              disabled={isLoadingPolicies || isMutatingPolicies || !canManageFeePolicy}
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
                  <TableCell title={row.orgUnitName}>{row.orgUnitCode}</TableCell>
                  <TableCell>{row.policyPercentage}</TableCell>
                  <TableCell>{row.entryUserId}</TableCell>
                  <TableCell>{row.entryTimestamp}</TableCell>
                  <TableCell>{row.updateUserId}</TableCell>
                  <TableCell>{row.updateTimestamp}</TableCell>
                  <TableCell>
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => editFeePolicy(row)}
                      disabled={isLoadingPolicies || isMutatingPolicies}
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
                  </TableCell>
                </TableRow>
              ))}
              {feePolicies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>No fee policy rows yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Fee in lieu percent policy administration</h2>
          <p>
            Records: <strong>{filPolicyCount}</strong>
          </p>
          <div className="legacy-search-grid">
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
          <div className="legacy-search-actions">
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
                  </TableCell>
                </TableRow>
              ))}
              {filPolicies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>No fee in lieu policy rows yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Tile>
      </Column>
    </Grid>
  )
}

export default AdminPoliciesPage
