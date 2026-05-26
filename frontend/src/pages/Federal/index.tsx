import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const FederalPage: FC = () => {
  return (
    <LegacyModulePage
      title="Federal"
      description="Landing page for federal workflows including search, documents, remarks, shipping, and item tabs."
      legacySourcePath="src/main/webapp/javascript/federal"
    />
  )
}

export default FederalPage
