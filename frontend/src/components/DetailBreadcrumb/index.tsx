import { Breadcrumb, BreadcrumbItem } from '@carbon/react'
import { Link, type To } from 'react-router-dom'

export type DetailBreadcrumbProps = {
  label: string
  to: To
}

/**
 * Canonical parent-search navigation for an object detail page.
 *
 * The destination is intentionally supplied by the page instead of inferred
 * from browser history, so direct links and refreshed detail pages remain
 * deterministic.
 */
const DetailBreadcrumb = ({ label, to }: DetailBreadcrumbProps) => (
  <Breadcrumb noTrailingSlash={false} size="sm">
    <BreadcrumbItem>
      <Link to={to}>{label}</Link>
    </BreadcrumbItem>
  </Breadcrumb>
)

export default DetailBreadcrumb
