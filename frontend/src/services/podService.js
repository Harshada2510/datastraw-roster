import { createNamedResourceService } from './namedResourceService'

export const podService = createNamedResourceService({
  path: '/api/pods',
  collectionLabel: 'Pods',
  recordLabel: 'Pod',
})
