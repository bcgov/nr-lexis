import { useEffect, useMemo, useState } from 'react'
import { Button, Column, Grid, InlineNotification, Loading } from '@carbon/react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import DetailBreadcrumb from '@/components/DetailBreadcrumb'
import DetailLoadError from '@/components/DetailLoadError'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/context/auth/useAuth'
import { hasProvincialSubmitterRole, hasRole } from '@/context/auth/role-utils'
import type { ProvincialExemptionDetail } from '@/interfaces/LexisDetails'
import { readDetailReturnTo, withDetailReturnTo } from '@/pages/shared/detail-navigation'
import {
  mapValueLabelOptionsToIdTextOptions,
  type IdTextOption,
} from '@/pages/shared/search-query-utils'
import { fetchProvincialExemptionDetail } from '@/service/lexis-detail-service'
import {
  fetchExemptionEditContext,
  type ExemptionEditContext,
} from '@/service/provincial-exemption-detail-service'
import { fetchProvincialExemptionOptions } from '@/service/search-options-service'
import BlanketOicPermitCreateForm from './BlanketOicPermitCreateForm'

const isBlanketOic = (detail: ProvincialExemptionDetail): boolean =>
  (detail.exemptionTypeCode ?? '').trim().toUpperCase() === 'B'

type BlanketOicPermitCreateContentProps = {
  normalizedExemptionNumber: string
  roles: string[]
  onCancel: () => void
  onCreated: (permitNumber: string) => void
}

const BlanketOicPermitCreateContent = ({
  normalizedExemptionNumber,
  roles,
  onCancel,
  onCreated,
}: BlanketOicPermitCreateContentProps) => {
  const [detail, setDetail] = useState<ProvincialExemptionDetail | null>(null)
  const [editContext, setEditContext] = useState<ExemptionEditContext | null>(null)
  const [regionOptions, setRegionOptions] = useState<IdTextOption[]>([])
  const [loading, setLoading] = useState(() => Boolean(normalizedExemptionNumber))
  const [errorMessage, setErrorMessage] = useState(() =>
    normalizedExemptionNumber ? '' : 'An exemption number is required to create a permit.',
  )
  const [outcomeUnknownMessage, setOutcomeUnknownMessage] = useState('')

  useEffect(() => {
    if (!normalizedExemptionNumber) {
      return undefined
    }

    let active = true
    const loadPermitCreateContext = async (): Promise<void> => {
      try {
        const [detailResult, editContextResult, optionsResult] = await Promise.allSettled([
          fetchProvincialExemptionDetail(normalizedExemptionNumber),
          fetchExemptionEditContext(normalizedExemptionNumber),
          fetchProvincialExemptionOptions(),
        ])
        if (!active) return

        if (detailResult.status !== 'fulfilled') {
          console.error(detailResult.reason)
          setErrorMessage('Unable to retrieve provincial exemption detail.')
          return
        }
        if (!detailResult.value) {
          setErrorMessage(`No provincial exemption found for ${normalizedExemptionNumber}.`)
          return
        }
        if (editContextResult.status !== 'fulfilled') {
          console.error(editContextResult.reason)
          setErrorMessage(
            'Unable to retrieve exemption edit settings. Reload before creating a permit.',
          )
          return
        }
        if (optionsResult.status !== 'fulfilled') {
          console.error(optionsResult.reason)
          setErrorMessage(
            'Required permit options could not be loaded. Reload before creating a permit.',
          )
          return
        }

        setDetail(detailResult.value)
        setEditContext(editContextResult.value)
        setRegionOptions(mapValueLabelOptionsToIdTextOptions(optionsResult.value.regions))
      } catch (error) {
        if (active) {
          console.error(error)
          setErrorMessage('Unable to retrieve provincial exemption detail.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadPermitCreateContext()

    return () => {
      active = false
    }
  }, [normalizedExemptionNumber])

  const hasPermitCreationRole =
    hasRole(roles, 'APPLICATION_APPROVER') ||
    hasRole(roles, 'ADMIN') ||
    hasProvincialSubmitterRole(roles)
  const eligibilityMessage = !detail
    ? ''
    : !hasPermitCreationRole
      ? 'Your role cannot create Blanket OIC permits.'
      : !isBlanketOic(detail) || (detail.exemptionStatusCode ?? '').trim().toUpperCase() !== 'ACT'
        ? 'A new permit can only be created for an active Blanket OIC exemption.'
        : editContext?.locked
          ? editContext.lockMessage ||
            'This exemption is currently locked for editing by another user.'
          : ''

  return (
    <>
      {loading && (
        <Column
          sm={4}
          md={8}
          lg={16}
          className="detail-page-loading"
          role="status"
          aria-live="polite"
        >
          <Loading description="Loading Blanket OIC permit details…" withOverlay={false} />
        </Column>
      )}

      {!loading && !!errorMessage && <DetailLoadError message={errorMessage} />}

      {!loading && !errorMessage && !!eligibilityMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind="error"
            title="Permit creation unavailable"
            subtitle={eligibilityMessage}
            lowContrast
            hideCloseButton
          />
        </Column>
      )}

      {!loading && !errorMessage && !eligibilityMessage && !!outcomeUnknownMessage && (
        <Column sm={4} md={8} lg={16} className="detail-page-error">
          <InlineNotification
            kind="error"
            title="Permit creation outcome unknown"
            subtitle={outcomeUnknownMessage}
            lowContrast
            hideCloseButton
          />
          <div className="legacy-search-actions application-create-actions">
            <Button kind="tertiary" size="sm" onClick={onCancel}>
              Return to exemption
            </Button>
          </div>
        </Column>
      )}

      {!loading &&
        !errorMessage &&
        !eligibilityMessage &&
        !outcomeUnknownMessage &&
        detail &&
        editContext && (
          <Column sm={4} md={8} lg={16} className="application-detail-tabs-column">
            <BlanketOicPermitCreateForm
              exemptionNumber={detail.exemptionNumber}
              regionOptions={regionOptions}
              defaultRegionNumbers={editContext.regionNumbers}
              onCancel={onCancel}
              onCreated={onCreated}
              onUnknownOutcome={setOutcomeUnknownMessage}
            />
          </Column>
        )}
    </>
  )
}

const ProvincialBlanketOicPermitCreatePage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { exemptionNumber } = useParams()
  const { capabilities } = useAuth()
  const normalizedExemptionNumber = exemptionNumber?.trim() ?? ''
  const exemptionDetailPath = normalizedExemptionNumber
    ? `/provincial/exemption/${encodeURIComponent(normalizedExemptionNumber)}`
    : '/provincial/exemption'
  const detailReturnTo = useMemo(
    () =>
      readDetailReturnTo(location.state) ?? {
        label: 'Provincial exemption detail',
        to: exemptionDetailPath,
      },
    [exemptionDetailPath, location.state],
  )
  const roles = capabilities?.roles ?? []

  const cancel = () => {
    navigate(detailReturnTo.to, { state: detailReturnTo.state })
  }

  const created = (permitNumber: string) => {
    navigate(`/provincial/permit/${encodeURIComponent(permitNumber)}${location.search}`, {
      state: withDetailReturnTo(detailReturnTo.state, detailReturnTo),
    })
  }

  return (
    <Grid
      fullWidth
      className="default-grid detail-page-grid provincial-blanket-oic-permit-create-page"
    >
      <Column sm={4} md={8} lg={16}>
        <DetailBreadcrumb
          label="Provincial exemption detail"
          to={exemptionDetailPath}
          returnTo={detailReturnTo}
        />
      </Column>
      <Column sm={4} md={8} lg={16} className="detail-page-header">
        <PageHeader
          title="Apply for new Blanket OIC permit"
          subtitle={
            normalizedExemptionNumber
              ? `Enter permit details for Blanket OIC exemption ${normalizedExemptionNumber}.`
              : 'Enter the required permit details.'
          }
        />
      </Column>
      <BlanketOicPermitCreateContent
        key={normalizedExemptionNumber}
        normalizedExemptionNumber={normalizedExemptionNumber}
        roles={roles}
        onCancel={cancel}
        onCreated={created}
      />
    </Grid>
  )
}

export default ProvincialBlanketOicPermitCreatePage
