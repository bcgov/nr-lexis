import type { FC } from 'react'
import LegacyModulePage from '@/pages/shared/LegacyModulePage'

const IndianReservePage: FC = () => {
  return (
    <LegacyModulePage
      title="Indian Reserve"
      description="Landing page for Indian Reserve workflows including search, permit, package, shipping, and persistence."
      legacySourcePath="src/main/webapp/javascript/indianReserve"
    />
  )
}

export default IndianReservePage
