import type { TableBatchActionsProps } from '@carbon/react'

type BatchTranslate = NonNullable<TableBatchActionsProps['translateWithId']>

/** Carbon's batch bar names the selected records ("2 applications selected") instead of items. */
export const batchSelectionTranslator =
  (singular: string, plural: string): BatchTranslate =>
  (id, args) => {
    if (id === 'carbon.table.batch.cancel') return 'Cancel'
    if (id === 'carbon.table.batch.selectAll') return `Select all (${args?.totalCount ?? 0})`
    const totalSelected = args?.totalSelected ?? 0
    return `${totalSelected} ${totalSelected === 1 ? singular : plural} selected`
  }
