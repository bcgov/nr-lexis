import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialPage: FC = () => {
  return (
    <LegacyModulePage
      title="Provincial"
      description="Provincial workflows from nr-lexis-main have been mapped into React routes. Use the sub-sections below to continue module-by-module migration."
      legacySourcePath="src/main/webapp/javascript/provincial"
      childRoutes={[
        { label: 'Application', path: '/provincial/application' },
        { label: 'Exemption', path: '/provincial/exemption' },
        { label: 'Offers', path: '/provincial/offers' },
        { label: 'Permit', path: '/provincial/permit' },
        { label: 'Review', path: '/provincial/review' },
        { label: 'Summary', path: '/provincial/summary' },
      ]}
    />
  )
}

export default ProvincialPage
