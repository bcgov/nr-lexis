import { useMemo, useState, type FC } from 'react'
import {
  Button,
  Column,
  Grid,
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

type FeePolicyRow = {
  id: string
  effectiveDate: string
  orgUnitCode: string
  orgUnitName: string
  policyPercentage: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
}

type FilPolicyRow = {
  id: string
  effectiveDate: string
  filPercentage: string
  entryUserId: string
  entryTimestamp: string
  updateUserId: string
  updateTimestamp: string
}

const FEE_POLICY_STORAGE_KEY = 'lexis.admin.feePolicies'
const FIL_POLICY_STORAGE_KEY = 'lexis.admin.filPolicies'

const DEFAULT_USER_ID = 'CURRENT_USER'

const createTimestamp = (): string => new Date().toISOString()

const createRowId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const parseStoredArray = <T,>(value: string | null): T[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as T[]
  } catch {
    return []
  }
}

const loadFeePolicies = (): FeePolicyRow[] => {
  return parseStoredArray<FeePolicyRow>(localStorage.getItem(FEE_POLICY_STORAGE_KEY))
}

const loadFilPolicies = (): FilPolicyRow[] => {
  return parseStoredArray<FilPolicyRow>(localStorage.getItem(FIL_POLICY_STORAGE_KEY))
}

const persistFeePolicies = (rows: FeePolicyRow[]): void => {
  localStorage.setItem(FEE_POLICY_STORAGE_KEY, JSON.stringify(rows))
}

const persistFilPolicies = (rows: FilPolicyRow[]): void => {
  localStorage.setItem(FIL_POLICY_STORAGE_KEY, JSON.stringify(rows))
}

const sortByEffectiveDateDesc = <TRow extends { effectiveDate: string }>(rows: TRow[]): TRow[] => {
  return [...rows].sort((a, b) => {
    if (a.effectiveDate === b.effectiveDate) {
      return 0
    }
    return a.effectiveDate > b.effectiveDate ? -1 : 1
  })
}

const AdminPoliciesPage: FC = () => {
  const { canPerform } = useAuth()
  const canManageFeePolicy = canPerform('/lexisPolicyAdmin')
  const canManageFilPolicy = canPerform('/lexisFILAdmin')

  const [feePolicies, setFeePolicies] = useState<FeePolicyRow[]>(() =>
    sortByEffectiveDateDesc(loadFeePolicies()),
  )
  const [filPolicies, setFilPolicies] = useState<FilPolicyRow[]>(() =>
    sortByEffectiveDateDesc(loadFilPolicies()),
  )

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

  const upsertFeePolicy = (): void => {
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

    const timestamp = createTimestamp()

    if (editingFeePolicyId) {
      const updatedRows = sortByEffectiveDateDesc(
        feePolicies.map((row) =>
          row.id === editingFeePolicyId
            ? {
                ...row,
                effectiveDate: feeEffectiveDate,
                orgUnitCode: feeOrgUnitCode.trim().toUpperCase(),
                orgUnitName: feeOrgUnitName.trim(),
                policyPercentage: feePolicyPercentage.trim(),
                updateUserId: DEFAULT_USER_ID,
                updateTimestamp: timestamp,
              }
            : row,
        ),
      )
      setFeePolicies(updatedRows)
      persistFeePolicies(updatedRows)
      setSuccessMessage('Fee policy updated.')
    } else {
      const newRow: FeePolicyRow = {
        id: createRowId(),
        effectiveDate: feeEffectiveDate,
        orgUnitCode: feeOrgUnitCode.trim().toUpperCase(),
        orgUnitName: feeOrgUnitName.trim(),
        policyPercentage: feePolicyPercentage.trim(),
        entryUserId: DEFAULT_USER_ID,
        entryTimestamp: timestamp,
        updateUserId: DEFAULT_USER_ID,
        updateTimestamp: timestamp,
      }
      const updatedRows = sortByEffectiveDateDesc([...feePolicies, newRow])
      setFeePolicies(updatedRows)
      persistFeePolicies(updatedRows)
      setSuccessMessage('Fee policy added.')
    }

    resetFeeForm()
  }

  const editFeePolicy = (row: FeePolicyRow): void => {
    setFeeEffectiveDate(row.effectiveDate)
    setFeeOrgUnitCode(row.orgUnitCode)
    setFeeOrgUnitName(row.orgUnitName)
    setFeePolicyPercentage(row.policyPercentage)
    setEditingFeePolicyId(row.id)
    clearNotifications()
  }

  const deleteFeePolicy = (rowId: string): void => {
    clearNotifications()
    const updatedRows = feePolicies.filter((row) => row.id !== rowId)
    setFeePolicies(updatedRows)
    persistFeePolicies(updatedRows)
    if (editingFeePolicyId === rowId) {
      resetFeeForm()
    }
    setSuccessMessage('Fee policy deleted.')
  }

  const upsertFilPolicy = (): void => {
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

    const timestamp = createTimestamp()

    if (editingFilPolicyId) {
      const updatedRows = sortByEffectiveDateDesc(
        filPolicies.map((row) =>
          row.id === editingFilPolicyId
            ? {
                ...row,
                effectiveDate: filEffectiveDate,
                filPercentage: filPolicyPercentage.trim(),
                updateUserId: DEFAULT_USER_ID,
                updateTimestamp: timestamp,
              }
            : row,
        ),
      )
      setFilPolicies(updatedRows)
      persistFilPolicies(updatedRows)
      setSuccessMessage('FIL policy updated.')
    } else {
      const newRow: FilPolicyRow = {
        id: createRowId(),
        effectiveDate: filEffectiveDate,
        filPercentage: filPolicyPercentage.trim(),
        entryUserId: DEFAULT_USER_ID,
        entryTimestamp: timestamp,
        updateUserId: DEFAULT_USER_ID,
        updateTimestamp: timestamp,
      }
      const updatedRows = sortByEffectiveDateDesc([...filPolicies, newRow])
      setFilPolicies(updatedRows)
      persistFilPolicies(updatedRows)
      setSuccessMessage('FIL policy added.')
    }

    resetFilForm()
  }

  const editFilPolicy = (row: FilPolicyRow): void => {
    setFilEffectiveDate(row.effectiveDate)
    setFilPolicyPercentage(row.filPercentage)
    setEditingFilPolicyId(row.id)
    clearNotifications()
  }

  const deleteFilPolicy = (rowId: string): void => {
    clearNotifications()
    const updatedRows = filPolicies.filter((row) => row.id !== rowId)
    setFilPolicies(updatedRows)
    persistFilPolicies(updatedRows)
    if (editingFilPolicyId === rowId) {
      resetFilForm()
    }
    setSuccessMessage('FIL policy deleted.')
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
            TODO: replace local storage policy state with Spring policy admin APIs when
            `/lexisPolicyAdmin` and `/lexisFILAdmin` RPC replacements are available.
          </p>
          <p>
            Fee policy access:{' '}
            <Tag type={canManageFeePolicy ? 'green' : 'red'}>
              {canManageFeePolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </p>
          <p>
            FIL policy access:{' '}
            <Tag type={canManageFilPolicy ? 'green' : 'red'}>
              {canManageFilPolicy ? 'Allowed' : 'Not Granted'}
            </Tag>
          </p>
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
            <Button kind="primary" onClick={upsertFeePolicy} disabled={!canManageFeePolicy}>
              {editingFeePolicyId ? 'Update Fee Policy' : 'Add Fee Policy'}
            </Button>
            <Button kind="ghost" onClick={resetFeeForm}>
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
                    <Button kind="ghost" size="sm" onClick={() => editFeePolicy(row)}>
                      Edit
                    </Button>
                    <Button kind="ghost" size="sm" onClick={() => deleteFeePolicy(row.id)}>
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
            <Button kind="primary" onClick={upsertFilPolicy} disabled={!canManageFilPolicy}>
              {editingFilPolicyId ? 'Update FIL Policy' : 'Add FIL Policy'}
            </Button>
            <Button kind="ghost" onClick={resetFilForm}>
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
                    <Button kind="ghost" size="sm" onClick={() => editFilPolicy(row)}>
                      Edit
                    </Button>
                    <Button kind="ghost" size="sm" onClick={() => deleteFilPolicy(row.id)}>
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
