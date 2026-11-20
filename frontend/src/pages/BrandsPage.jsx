import { Archive, BadgeCheck, Tags } from 'lucide-react'
import NamedResourceManagement from '../components/NamedResourceManagement'
import { brandService } from '../services/brandService'
import { createNamedResourceUtils } from '../utils/namedResourceValidation'

// Defined at module scope so the service, validation and icon references are
// stable across renders (the shared list hook depends on them).
const brandConfig = {
  title: 'Brand Management',
  description: 'Create, review and maintain brand master records.',
  resourceLabel: 'brand',
  resourceLabelPlural: 'brands',
  detailsTitle: 'Brand details',
  nameField: 'brand_name',
  nameLabel: 'Brand Name',
  idLabel: 'Brand ID',
  searchPlaceholder: 'Search by brand name',
  directoryLabel: 'Brand directory',
  icons: { total: Tags, active: BadgeCheck, inactive: Archive },
  service: brandService,
  validation: createNamedResourceUtils('brand_name', 'Brand Name'),
}

export default function BrandsPage() {
  return <NamedResourceManagement config={brandConfig} />
}
