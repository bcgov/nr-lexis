import { type ComponentProps, type FC } from 'react'
import { Tag, Tooltip } from '@carbon/react'

type ApiSourceTagProps = {
  context: string
  tagType?: ComponentProps<typeof Tag>['type']
  align?: ComponentProps<typeof Tooltip>['align']
}

export const ApiSourceTag: FC<ApiSourceTagProps> = ({
  context,
  tagType = 'green',
  align = 'top',
}) => {
  return (
    <Tooltip
      align={align}
      label="Application Programming Interface (API)"
      description={context}
    >
      <Tag type={tagType}>API</Tag>
    </Tooltip>
  )
}
