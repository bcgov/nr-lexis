import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tile } from '@carbon/react'
import type { CreateDraftRecord } from '@/service/create-draft-service'

type Props = {
  title: string
  drafts: CreateDraftRecord<unknown>[]
  summarize: (payload: unknown) => string
}

const CreateDraftHistory = ({ title, drafts, summarize }: Props) => {
  return (
    <Tile>
      <h2 className="dashboard-title">{title}</h2>
      <Table useZebraStyles size="sm">
        <TableHead>
          <TableRow>
            <TableHeader>Draft ID</TableHeader>
            <TableHeader>Saved At</TableHeader>
            <TableHeader>Summary</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {drafts.slice(0, 5).map((record) => (
            <TableRow key={record.id}>
              <TableCell>{record.id}</TableCell>
              <TableCell>{new Date(record.savedAt).toLocaleString()}</TableCell>
              <TableCell>{summarize(record.payload)}</TableCell>
            </TableRow>
          ))}
          {drafts.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>No drafts saved yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Tile>
  )
}

export default CreateDraftHistory
