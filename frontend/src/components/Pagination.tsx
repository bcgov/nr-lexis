import { Pagination as CarbonPagination, type PaginationProps } from '@carbon/react'

const formatCount = (value: number): string => value.toLocaleString('en-CA')

const pagesLabel = (total: number): string =>
  `${formatCount(total)} ${total === 1 ? 'page' : 'pages'}`

/** Carbon pagination with item and page counts grouped by thousands, such as "1–10 of 3,574 items". */
function Pagination(props: PaginationProps) {
  return (
    <CarbonPagination
      itemText={(min, max) => `${formatCount(min)}–${formatCount(max)} items`}
      itemRangeText={(min, max, total) =>
        `${formatCount(min)}–${formatCount(max)} of ${formatCount(total)} items`
      }
      pageRangeText={(_current, total) => `of ${pagesLabel(total)}`}
      pageSelectLabelText={(total) => `Page of ${pagesLabel(total)}`}
      {...props}
    />
  )
}

export default Pagination
