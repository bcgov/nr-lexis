import type { FC } from 'react'
import { Column, Grid, Tile } from '@carbon/react'
import { Link } from 'react-router-dom'

const QUICK_LINKS = [
  {
    title: 'Provincial Application Search',
    path: '/provincial/application',
    description: 'Search and manage provincial applications.',
  },
  {
    title: 'Provincial Exemption Search',
    path: '/provincial/exemption',
    description: 'View and approve exemption files.',
  },
  {
    title: 'Provincial Permit Search',
    path: '/provincial/permit',
    description: 'Browse and review permit records.',
  },
  {
    title: 'Provincial Offer Search',
    path: '/provincial/offers',
    description: 'Track purchase offers and status changes.',
  },
  {
    title: 'Federal Application Search',
    path: '/federal',
    description: 'Review federal application workflows.',
  },
  {
    title: 'Indian Reserve Permit Search',
    path: '/indian-reserve',
    description: 'Access permit workflows for Indian reserve files.',
  },
]

const Dashboard: FC = () => {
  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={16}>
        <h1 className="dashboard-title">LEXIS Dashboard</h1>
        <p>Start from the base search views while detailed migration continues module by module.</p>
      </Column>
      {QUICK_LINKS.map((link) => (
        <Column key={link.path} sm={4} md={4} lg={8}>
          <Tile>
            <h2 className="dashboard-title">{link.title}</h2>
            <p>{link.description}</p>
            <Link className="cds--link" to={link.path}>
              Open view
            </Link>
          </Tile>
        </Column>
      ))}
    </Grid>
  )
}

export default Dashboard
