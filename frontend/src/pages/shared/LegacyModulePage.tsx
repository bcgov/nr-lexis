import { Column, Grid, Link as CarbonLink, Tile } from '@carbon/react'
import { Link } from 'react-router-dom'

type ChildRoute = {
  label: string
  path: string
}

export type LegacyModulePageProps = {
  title: string
  description: string
  childRoutes?: ChildRoute[]
}

function LegacyModulePage({ title, description, childRoutes = [] }: LegacyModulePageProps) {
  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>{title}</h1>
        <p>{description}</p>
      </Column>
      {childRoutes.length > 0 && (
        <Column sm={4} md={8} lg={12}>
          <Tile>
            <h2>Sub-sections</h2>
            <ul className="module-link-list">
              {childRoutes.map((route) => (
                <li key={route.path}>
                  <CarbonLink as={Link} to={route.path}>
                    {route.label}
                  </CarbonLink>
                </li>
              ))}
            </ul>
          </Tile>
        </Column>
      )}
    </Grid>
  )
}

export default LegacyModulePage
