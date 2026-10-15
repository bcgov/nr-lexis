import { Search } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { focusFirstInvalidField } from '@/utils/focus'

type SearchSubmitButtonProps = {
  loading: boolean
  disabled?: boolean
  /** Search stays enabled; while a filter is invalid it doesn't run and focuses that filter. */
  invalid?: boolean
}

/** While a search runs, the button keeps focus and ignores clicks; the results show progress. */
const SearchSubmitButton = ({
  loading,
  disabled = false,
  invalid = false,
}: SearchSubmitButtonProps) => {
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
        if (loading) {
          event.preventDefault()
        } else if (invalid) {
          event.preventDefault()
          focusFirstInvalidField(event.currentTarget.form)
        }
      }}
    >
      Search
    </Button>
  )
}

export default SearchSubmitButton
