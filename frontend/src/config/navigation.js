import {
  Boxes,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Sun,
  Tags,
  Users,
  Workflow,
} from 'lucide-react'

// Single source of truth for the sidebar, page titles and dashboard links.
export const navigationGroups = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: LayoutDashboard,
        description: 'Landing page with shortcuts to every module.',
      },
    ],
  },
  {
    label: 'Master Data',
    items: [
      {
        label: 'Employees',
        path: '/employees',
        icon: Users,
        description: 'Employee master records and details.',
      },
      {
        label: 'Brands',
        path: '/brands',
        icon: Tags,
        description: 'Brands used by assignments and requirements.',
      },
      {
        label: 'Processes',
        path: '/processes',
        icon: Workflow,
        description: 'Work processes used across the system.',
      },
      {
        label: 'Pods',
        path: '/pods',
        icon: Boxes,
        description: 'Employee pods and pod leads.',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Assignments',
        path: '/assignments',
        icon: ClipboardList,
        description: 'Employee, brand and process assignments.',
      },
      {
        label: 'Leaves',
        path: '/leaves',
        icon: CalendarDays,
        description: 'Employee leave requests and their status.',
      },
      {
        label: 'Weekly Offs',
        path: '/weekly-offs',
        icon: CalendarOff,
        description: 'Recurring weekly off days by employee.',
      },
      {
        label: 'Holidays',
        path: '/holidays',
        icon: Sun,
        description: 'Organisation-wide holiday list.',
      },
    ],
  },
  {
    label: 'Planning',
    items: [
      {
        label: 'Calendar',
        path: '/calendar',
        icon: Calendar,
        description: 'Monthly view of holidays, leaves and weekly offs.',
      },
      {
        label: 'Staffing Requirements',
        path: '/staffing-requirements',
        icon: ListChecks,
        description: 'Required employee counts by date range.',
      },
      {
        label: 'Monthly Roster',
        path: '/roster',
        icon: CalendarCheck2,
        description: 'Generate and review the monthly employee roster.',
      },
    ],
  },
]

export const navItems = navigationGroups.flatMap((group) => group.items)

export function getNavItemByPath(pathname) {
  return navItems.find((item) => item.path === pathname) ?? null
}
