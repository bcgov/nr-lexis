import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialSummaryPage: FC = () => {
  return (
    <LegacyModulePage
      title="Provincial Summary"
      description="Landing page for provincial summary views and output migration."
      legacySourcePath="src/main/webapp/javascript/provincial/summary"
    />
  )
}

export default ProvincialSummaryPage
