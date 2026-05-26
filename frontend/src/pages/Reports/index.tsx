import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ReportsPage: FC = () => {
  return (
    <LegacyModulePage
      title="Reports"
      description="Landing page for report workflows, including transport reports and generated outputs."
      legacySourcePath="src/main/webapp/javascript/reports"
    />
  )
}

export default ReportsPage
