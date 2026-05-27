import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
} from '@carbon/react'
import type { CreateDraftRecord } from '@/service/create-draft-service'

type Props = {
  title: string
  drafts: CreateDraftRecord<unknown>[]
  summarize: (payload: unknown) => string
  onUseDraft?: (draft: CreateDraftRecord<unknown>) => void
  onDeleteDraft?: (draftId: string) => void
}

const CreateDraftHistory = ({ title, drafts, summarize, onUseDraft, onDeleteDraft }: Props) => {
  const showActions = Boolean(onUseDraft || onDeleteDraft)

  return (
    <Tile>
      <h2 className="dashboard-title">{title}</h2>
      <Table useZebraStyles size="sm">
        <TableHead>
          <TableRow>
            <TableHeader>Draft ID</TableHeader>
            <TableHeader>Saved At</TableHeader>
            <TableHeader>Summary</TableHeader>
            {showActions && <TableHeader>Actions</TableHeader>}
          </TableRow>
        </TableHead>
        <TableBody>
          {drafts.slice(0, 5).map((record) => (
            <TableRow key={record.id}>
              <TableCell>{record.id}</TableCell>
              <TableCell>{new Date(record.savedAt).toLocaleString()}</TableCell>
              <TableCell>{summarize(record.payload)}</TableCell>
              {showActions && (
                <TableCell>
                  <div className="legacy-search-actions">
                    {!!onUseDraft && (
                      <Button kind="ghost" size="sm" onClick={() => onUseDraft(record)}>
                        Load
                      </Button>
                    )}
                    {!!onDeleteDraft && (
                      <Button
                        kind="danger--tertiary"
                        size="sm"
                        onClick={() => onDeleteDraft(record.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
          {drafts.length === 0 && (
            <TableRow>
              <TableCell colSpan={showActions ? 4 : 3}>No drafts saved yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Tile>
  )
}

export default CreateDraftHistory
