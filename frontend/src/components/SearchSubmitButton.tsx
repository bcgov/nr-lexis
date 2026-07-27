import { Search } from '@carbon/icons-react'
import { Button, Loading } from '@carbon/react'

type SearchSubmitButtonProps = {
  loading: boolean
  disabled?: boolean
}

const SearchingIcon = () => <Loading small withOverlay={false} description="" />

const SearchSubmitButton = ({ loading, disabled = false }: SearchSubmitButtonProps) => {
  return (
    <Button
      type="submit"
      kind="primary"
      size="md"
      disabled={loading || disabled}
      renderIcon={loading ? SearchingIcon : Search}
    >
      {loading ? 'Searching...' : 'Search'}
    </Button>
  )
}

export default SearchSubmitButton
