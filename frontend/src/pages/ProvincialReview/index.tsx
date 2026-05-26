import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialReviewPage: FC = () => {
  return (
    <LegacyModulePage
      title="Provincial Review"
      description="Landing page for provincial review workflow migration."
      legacySourcePath="src/main/webapp/javascript/provincial/review"
    />
  )
}

export default ProvincialReviewPage
