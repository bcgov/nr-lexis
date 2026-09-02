import { ArrowLeft } from '@carbon/icons-react'
import { Breadcrumb, BreadcrumbItem } from '@carbon/react'
import { Link, type To, useLocation } from 'react-router-dom'
import { readDetailReturnTrail, type DetailReturnTo } from '@/pages/shared/detail-navigation'

type DetailBreadcrumbProps = {
  label: string
  to: To
  returnTo?: DetailReturnTo
}

const returnPathname = (to: string): string => new URL(to, 'https://lexis.local').pathname

/**
 * Contextual ancestor navigation for an object detail page.
 *
 * One ancestor uses a named Back link. Deeper detail routes use Carbon's
 * breadcrumb and restore each ancestor's saved router state. The destinations
 * are explicit rather than inferred from browser history, so direct links and
 * refreshed detail pages remain deterministic.
 */
const DetailBreadcrumb = ({ label, to, returnTo }: DetailBreadcrumbProps) => {
  const location = useLocation()
  const returnTrail = returnTo ? readDetailReturnTrail(returnTo) : []
  const trail = returnTrail.filter((ancestor, index, ancestors) => {
    const pathname = returnPathname(ancestor.to)
    return (
      pathname !== location.pathname &&
      ancestors.findLastIndex((candidate) => returnPathname(candidate.to) === pathname) === index
    )
  })
  if (trail.length < 2) {
    const parent = trail[0]
    return (
      <Link className="back-link" to={parent?.to ?? to} state={parent?.state}>
        <ArrowLeft size={16} aria-hidden />
        Back to {parent?.label ?? label}
      </Link>
    )
  }

  return (
    <Breadcrumb aria-label="Breadcrumb">
      {trail.map((ancestor) => (
        <BreadcrumbItem key={`${ancestor.label}:${ancestor.to}`}>
          <Link to={ancestor.to} state={ancestor.state}>
            {ancestor.label}
          </Link>
        </BreadcrumbItem>
      ))}
    </Breadcrumb>
  )
}

export default DetailBreadcrumb
