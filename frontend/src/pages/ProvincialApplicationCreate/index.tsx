import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialApplicationCreatePage: FC = () => {
  return (
    <LegacyModulePage
      title="Create Provincial Application"
      description="Creation flow shell for provincial application details and tab workflows."
      legacySourcePath="src/main/webapp/WEB-INF/jsp/provincial/application/application.jsp"
    />
  )
}

export default ProvincialApplicationCreatePage
