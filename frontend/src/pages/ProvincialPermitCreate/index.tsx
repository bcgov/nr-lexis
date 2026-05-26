import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const ProvincialPermitCreatePage: FC = () => {
  return (
    <LegacyModulePage
      title="Create Provincial Permit"
      description="Creation flow shell for Provincial Permit details. Next step is migrating permit detail tabs (permit, items, fees, invoices, shipping, owner, BOIC)."
      legacySourcePath="src/main/webapp/WEB-INF/jsp/provincial/permit/permit.jsp"
    />
  )
}

export default ProvincialPermitCreatePage
