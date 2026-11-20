import { createNamedResourceService } from './namedResourceService'

export const brandService = createNamedResourceService({
  path: '/api/brands',
  collectionLabel: 'Brands',
  recordLabel: 'Brand',
})
