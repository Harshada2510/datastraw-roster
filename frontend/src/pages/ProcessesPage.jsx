import { CircleCheck, CircleSlash, Workflow } from 'lucide-react'
import NamedResourceManagement from '../components/NamedResourceManagement'
import { processService } from '../services/processService'
import { createNamedResourceUtils } from '../utils/namedResourceValidation'

// Defined at module scope so the service, validation and icon references are
// stable across renders (the shared list hook depends on them).
const processConfig = {
  title: 'Process Management',
  description: 'Create, review and maintain work process master records.',
  resourceLabel: 'process',
  resourceLabelPlural: 'processes',
  detailsTitle: 'Process details',
  nameField: 'process_name',
  nameLabel: 'Process Name',
  idLabel: 'Process ID',
  searchPlaceholder: 'Search by process name',
  directoryLabel: 'Process directory',
  icons: { total: Workflow, active: CircleCheck, inactive: CircleSlash },
  service: processService,
  validation: createNamedResourceUtils('process_name', 'Process Name'),
}

export default function ProcessesPage() {
  return <NamedResourceManagement config={processConfig} />
}
