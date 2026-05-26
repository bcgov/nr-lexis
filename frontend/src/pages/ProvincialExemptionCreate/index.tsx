import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialExemptionCreatePage: FC = () => {
  return (
    <LegacyModulePage
      title="Create Provincial Exemption"
      description="Creation flow shell for provincial exemption details and tab workflows."
      legacySourcePath="src/main/webapp/WEB-INF/jsp/provincial/exemption/exemption.jsp"
    />
  )
}

export default ProvincialExemptionCreatePage
