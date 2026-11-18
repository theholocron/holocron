/**
* This is a Checkly CLI Dashboard construct. To learn more, visit:
* - https://www.checklyhq.com/docs/cli/
* - https://www.checklyhq.com/docs/cli/constructs-reference/#dashboard
*/

import { Dashboard } from 'checkly/constructs'

new Dashboard('the-holocron-iqXRXMhc', {
  tags: ['sentinel', 'comlink', 'docs'],
  customDomain: 'status.theholocron.dev',
  logo: '',
  favicon: '',
  link: '',
  header: 'The Holocron',
  description: 'Holocron CLI status',
  width: 'FULL',
  refreshRate: 60,
  paginate: true,
  paginationRate: 60,
  sortByStatus: false,
  checksPerPage: 15,
  useTagsAndOperator: false,
  hideTags: false,
  enableIncidents: false,
  expandChecks: false,
  isPrivate: false,
  showP95: true,
  showP99: true,
  showHeader: true,
})
