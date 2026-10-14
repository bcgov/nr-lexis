import { Search } from '@carbon/icons-react'
import { Button } from '@carbon/react'

type SearchSubmitButtonProps = {
  loading: boolean
  disabled?: boolean
}

/** While a search runs, the button keeps focus and ignores clicks; the results show progress. */
const SearchSubmitButton = ({ loading, disabled = false }: SearchSubmitButtonProps) => {
  return (
    <Button
      type="submit"
      kind="primary"
      size="md"
      disabled={disabled}
      aria-disabled={loading || undefined}
      renderIcon={Search}
      onClick={(event) => {
        // Enter in a filter submits through this button too, so this also stops a second search.
        if (loading) event.preventDefault()
      }}
    >
      Search
    </Button>
  )
}

export default SearchSubmitButton
