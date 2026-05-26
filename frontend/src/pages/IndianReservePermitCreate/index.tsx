import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const IndianReservePermitCreatePage: FC = () => {
  return (
    <LegacyModulePage
      title="Create Indian Reserve Permit"
      description="Creation flow shell for Indian Reserve permit details and tab workflows."
      legacySourcePath="src/main/webapp/WEB-INF/jsp/indianReserve/permit/permit.jsp"
    />
  )
}

export default IndianReservePermitCreatePage
