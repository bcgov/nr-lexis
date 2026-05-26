import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialExemptionPage: FC = () => {
  return (
    <LegacyModulePage
      title="Provincial Exemption"
      description="Landing page for exemption workflows. Route is in place and ready for incremental feature migration."
      legacySourcePath="src/main/webapp/javascript/provincial/exemption"
    />
  )
}

export default ProvincialExemptionPage
