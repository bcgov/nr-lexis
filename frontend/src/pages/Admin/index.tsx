import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const AdminPage: FC = () => {
  return (
    <LegacyModulePage
      title="Administration"
      description="Landing page for admin policy management flows (fee policy and FIL percent policy)."
      legacySourcePath="src/main/webapp/javascript/admin"
    />
  )
}

export default AdminPage
