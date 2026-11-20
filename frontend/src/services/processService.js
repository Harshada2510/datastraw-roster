import { createNamedResourceService } from './namedResourceService'

export const processService = createNamedResourceService({
  path: '/api/processes',
  collectionLabel: 'Processes',
  recordLabel: 'Process',
})
