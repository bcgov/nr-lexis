import { type ComponentProps } from 'react'
import { Tag, Tooltip, type TagProps } from '@carbon/react'

export type ApiSourceTagProps = {
  context: string
  tagType?: TagProps<'div'>['type']
  align?: ComponentProps<typeof Tooltip>['align']
}

export function ApiSourceTag({ context, tagType = 'green', align = 'top' }: ApiSourceTagProps) {
  return (
    <Tooltip align={align} label="Application Programming Interface (API)" description={context}>
      <Tag type={tagType}>API</Tag>
    </Tooltip>
  )
}
