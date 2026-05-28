import { Column, Grid, Link as CarbonLink, Tile } from '@carbon/react'
import { type FC } from 'react'
import { Link } from 'react-router-dom'

type ChildRoute = {
  label: string
  path: string
}

type Props = {
  title: string
  description: string
  legacySourcePath: string
  childRoutes?: ChildRoute[]
}

const LegacyModulePage: FC<Props> = ({
  title,
  description,
  legacySourcePath,
  childRoutes = [],
}) => {
  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>{title}</h1>
        <p>{description}</p>
        <p>
          Legacy source reference: <code>{legacySourcePath}</code>
        </p>
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
