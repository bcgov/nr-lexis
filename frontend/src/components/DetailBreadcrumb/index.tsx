import { ArrowLeft } from '@carbon/icons-react'
import { Link, type To } from 'react-router-dom'
import type { DetailReturnTo } from '@/pages/shared/detail-navigation'

export type DetailBreadcrumbProps = {
  label: string
  to: To
  returnTo?: DetailReturnTo
}

/**
 * Canonical parent-search navigation for an object detail page.
 *
 * The destination is intentionally supplied by the page instead of inferred
 * from browser history, so direct links and refreshed detail pages remain
 * deterministic.
 */
const DetailBreadcrumb = ({ label, to, returnTo }: DetailBreadcrumbProps) => (
  <Link className="back-link" to={returnTo?.to ?? to}>
    <ArrowLeft size={16} aria-hidden />
    Back to {returnTo?.label ?? label}
  </Link>
)

export default DetailBreadcrumb
