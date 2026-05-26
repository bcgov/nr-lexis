import { Column, Grid } from '@carbon/react'
import type { FC } from 'react'
import { useParams } from 'react-router-dom'

const ProvincialOfferDetailsPage: FC = () => {
  const { offerNumber } = useParams()

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>Provincial Offer Details</h1>
        <p>
          Offer <code>{offerNumber}</code> detail route is wired and ready for tab migration.
        </p>
        <p>
          Legacy source reference:{' '}
          <code>src/main/webapp/WEB-INF/jsp/provincial/offers/offers.jsp</code>
        </p>
      </Column>
    </Grid>
  )
}

export default ProvincialOfferDetailsPage
