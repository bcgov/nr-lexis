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
import { useAuth } from '@/context/auth/useAuth'
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

  const feePolicyCount = useMemo(() => feePolicies.length, [feePolicies.length])
  const filPolicyCount = useMemo(() => filPolicies.length, [filPolicies.length])

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
  }

  const resetFilForm = (): void => {
    setFilEffectiveDate('')
    setFilPolicyPercentage('')
    setEditingFilPolicyId(null)
  }

  const isValidPercentage = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim())

  const loadPolicies = useCallback(async () => {
    setIsLoadingPolicies(true)
    clearNotifications()

    try {
      const [loadedFeePolicies, loadedFilPolicies] = await Promise.all([
        fetchFeePolicies(),
        fetchFilPolicies(),
      ])
      setFeePolicies(loadedFeePolicies)
      setFilPolicies(loadedFilPolicies)
    } catch (error) {
      console.error(error)
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`Unable to load policy data (status ${status}).`)
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

    if (!feeEffectiveDate || !feeOrgUnitCode.trim() || !feePolicyPercentage.trim()) {
      setErrorMessage('Fee policy requires effective date, region code, and percentage.')
      return
    }

    if (!isValidPercentage(feePolicyPercentage)) {
      setErrorMessage('Fee policy percentage must be numeric.')
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
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`Fee policy request failed with status ${status}.`)
      } else {
        setErrorMessage('Fee policy request failed.')
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
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`Fee policy delete failed with status ${status}.`)
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

    if (!filEffectiveDate || !filPolicyPercentage.trim()) {
      setErrorMessage('FIL policy requires effective date and percentage.')
      return
    }

    if (!isValidPercentage(filPolicyPercentage)) {
      setErrorMessage('FIL policy percentage must be numeric.')
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
      setSuccessMessage(editingFilPolicyId ? 'FIL policy updated.' : 'FIL policy added.')
      resetFilForm()
    } catch (error) {
      console.error(error)
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`FIL policy request failed with status ${status}.`)
      } else {
        setErrorMessage('FIL policy request failed.')
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  const editFilPolicy = (row: FilPolicyRow): void => {
    setFilEffectiveDate(row.effectiveDate)
    setFilPolicyPercentage(row.filPercentage)
    setEditingFilPolicyId(row.id)
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
      setSuccessMessage('FIL policy deleted.')
    } catch (error) {
      console.error(error)
      const status = (error as any)?.response?.status
      if (status) {
        setErrorMessage(`FIL policy delete failed with status ${status}.`)
      } else {
        setErrorMessage('FIL policy delete failed.')
      }
    } finally {
      setIsMutatingPolicies(false)
    }
  }

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1>Policy Center</h1>
        <p>Native React baseline for fee policy and FIL percent policy administration.</p>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <p className="landing-help-text">
            Policy administration is API-first. Local draft fallback is available only when
            explicitly enabled with <code>VITE_LEXIS_ENABLE_ADMIN_POLICY_LOCAL_FALLBACK=true</code>.
          </p>
          <div>
            Fee policy access:{' '}
            <Tag type={canManageFeePolicy ? 'green' : 'red'}>
              {canManageFeePolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </div>
          <div>
            FIL policy access:{' '}
            <Tag type={canManageFilPolicy ? 'green' : 'red'}>
              {canManageFilPolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </div>
          {isLoadingPolicies && <InlineLoading description="Loading policy data..." />}
          {successMessage && (
            <InlineNotification
              kind="success"
              title="Policy Update"
              subtitle={successMessage}
              lowContrast
              onCloseButtonClick={() => setSuccessMessage('')}
            />
          )}
          {errorMessage && (
            <InlineNotification
              kind="error"
              title="Policy Error"
              subtitle={errorMessage}
              lowContrast
              onCloseButtonClick={() => setErrorMessage('')}
            />
          )}
        </Tile>
      </Column>

      <Column sm={4} md={8} lg={16}>
        <Tile>
          <h2 className="dashboard-title">Fee Policy Administration</h2>
          <p>
            Records: <strong>{feePolicyCount}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="feeEffectiveDate"
              type="date"
              labelText="Policy Effective Date"
              value={feeEffectiveDate}
              onChange={(event) => setFeeEffectiveDate(event.target.value)}
            />
            <TextInput
              id="feeOrgUnitCode"
              labelText="Region Code"
              value={feeOrgUnitCode}
              onChange={(event) => setFeeOrgUnitCode(event.target.value)}
            />
            <TextInput
              id="feeOrgUnitName"
              labelText="Region Name"
              value={feeOrgUnitName}
              onChange={(event) => setFeeOrgUnitName(event.target.value)}
            />
            <TextInput
              id="feePolicyPercentage"
              labelText="Fee Increase Percentage"
              value={feePolicyPercentage}
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
          <h2 className="dashboard-title">FIL Percent Policy Administration</h2>
          <p>
            Records: <strong>{filPolicyCount}</strong>
          </p>
          <div className="legacy-search-grid">
            <TextInput
              id="filEffectiveDate"
              type="date"
              labelText="Policy Effective Date"
              value={filEffectiveDate}
              onChange={(event) => setFilEffectiveDate(event.target.value)}
            />
            <TextInput
              id="filPolicyPercentage"
              labelText="FIL Percentage"
              value={filPolicyPercentage}
              onChange={(event) => setFilPolicyPercentage(event.target.value)}
            />
          </div>
          <div className="legacy-search-actions">
            <Button
              kind="primary"
              onClick={() => void upsertFilPolicy()}
              disabled={isLoadingPolicies || isMutatingPolicies || !canManageFilPolicy}
            >
              {editingFilPolicyId ? 'Update FIL Policy' : 'Add FIL Policy'}
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
                <TableHeader>Effective Date</TableHeader>
                <TableHeader>FIL %</TableHeader>
                <TableHeader>Entry User</TableHeader>
                <TableHeader>Entry Timestamp</TableHeader>
                <TableHeader>Update User</TableHeader>
                <TableHeader>Update Timestamp</TableHeader>
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
                  <TableCell colSpan={7}>No FIL policy rows yet.</TableCell>
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
