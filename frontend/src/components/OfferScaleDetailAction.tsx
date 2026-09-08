import {
  Button,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import TableFrame from '@/components/TableFrame'
import { useAuth } from '@/context/auth/useAuth'
import {
  fetchOfferScaleDetails,
  type OfferScaleDetail,
  type OfferScaleTarget,
} from '@/service/offer-scale-detail-service'

type OfferScaleDetailActionProps = {
  target: OfferScaleTarget
  disabled?: boolean
}

const ScaleDetailDialog = ({
  target: { offerNumber, packageNumber },
  onClose,
}: {
  target: OfferScaleTarget
  onClose: () => void
}) => {
  const [rows, setRows] = useState<OfferScaleDetail[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const target: OfferScaleTarget =
      offerNumber !== undefined ? { offerNumber } : { packageNumber: packageNumber! }
    void fetchOfferScaleDetails(target, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setRows(response)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true)
        }
      })
    return () => controller.abort()
  }, [offerNumber, packageNumber])

  return (
    <Modal
      open
      size="lg"
      modalHeading="Scale Detail"
      aria-label="Scale Detail"
      closeButtonLabel="Close scale details"
      primaryButtonText="Close"
      onRequestSubmit={onClose}
      onRequestClose={onClose}
    >
      {failed ? (
        <InlineNotification
          kind="error"
          title="Unable to load scale details"
          subtitle="Close this dialog and try again."
          hideCloseButton
          lowContrast
        />
      ) : rows === null ? (
        <InlineLoading description="Loading scale details…" />
      ) : rows.length === 0 ? (
        <p>No scale details found for this package.</p>
      ) : (
        <TableFrame ariaLabel="Package scale details">
          <Table size="sm" useZebraStyles aria-label="Package scale details">
            <TableHead>
              <TableRow>
                <TableHeader>Timber mark</TableHeader>
                <TableHeader>Scale type</TableHeader>
                <TableHeader>Pieces</TableHeader>
                <TableHeader>Species</TableHeader>
                <TableHeader>Grade</TableHeader>
                <TableHeader>Volume (m³)</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                // This immutable, read-only result has no row identifiers and is never reordered.
                // eslint-disable-next-line @eslint-react/no-array-index-key
                <TableRow key={index}>
                  <TableCell>{row.timberMark}</TableCell>
                  <TableCell>
                    {row.cascadeSplitCode === 'W' ? 'C' : row.cascadeSplitCode === 'E' ? 'I' : ''}
                  </TableCell>
                  <TableCell>{row.pieces}</TableCell>
                  <TableCell>{row.species}</TableCell>
                  <TableCell>{row.grade}</TableCell>
                  <TableCell>{row.volume}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Modal>
  )
}

const ScaleDetailAction = ({ target, disabled }: OfferScaleDetailActionProps) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        kind="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        See Scale Detail
      </Button>
      {open && <ScaleDetailDialog target={target} onClose={() => setOpen(false)} />}
    </>
  )
}

const OfferScaleDetailAction = (props: OfferScaleDetailActionProps) => {
  const { capabilities } = useAuth()
  // A new package or access context closes the dialog and discards any pending response.
  const contextKey = JSON.stringify([
    props.target,
    props.disabled,
    capabilities.authenticated,
    capabilities.principal,
    capabilities.forestClientNumber,
    capabilities.forestClientSelectionRequired,
    capabilities.roles,
    capabilities.grantedActions,
  ])
  return <ScaleDetailAction key={contextKey} {...props} />
}

export default OfferScaleDetailAction
