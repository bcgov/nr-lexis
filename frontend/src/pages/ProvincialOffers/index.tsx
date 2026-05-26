import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialOffersPage: FC = () => {
  return (
    <LegacyModulePage
      title="Provincial Offers"
      description="Landing page for provincial offers workflows and supporting APIs."
      legacySourcePath="src/main/webapp/javascript/provincial/offers"
    />
  )
}

export default ProvincialOffersPage
