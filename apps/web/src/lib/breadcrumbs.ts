export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbSearchParams {
  get(name: string): string | null;
}

interface BreadcrumbResult {
  items: BreadcrumbItem[];
  supported: boolean;
}

const HOME: BreadcrumbItem = { label: '首页', href: '/dashboard' };

const MASTER_DATA_TABS: Record<string, string> = {
  partners: '合作伙伴',
  materials: '商品物料',
  warehouses: '仓库管理',
  vehicles: '车辆管理',
  price: '价格基准',
};

const ORGANIZATION_TABS: Record<string, string> = {
  company: '企业维护',
  dept: '部门管理',
  employee: '员工管理',
  users: '用户账号',
  'business-group': '业务组',
};

const SERVICE_ORGANIZATION_TYPES: Record<string, string> = {
  LOGISTICS_CARRIER: '物流承运商',
  QUALITY_INSTITUTION: '质检机构',
  WAREHOUSE_PORT: '仓储与港口',
  PROCESSING_PROVIDER: '加工服务商',
};

interface ResourceRoute {
  base: string;
  section: string;
  listLabel: string;
  detailLabel: string;
  createLabel?: string;
  editLabel?: string;
}

const RESOURCE_ROUTES: ResourceRoute[] = [
  { base: '/dashboard/contracts', section: '采销管理', listLabel: '合同管理', detailLabel: '合同详情', createLabel: '新建合同', editLabel: '编辑合同' },
  { base: '/dashboard/orders', section: '采销管理', listLabel: '执行批次管理', detailLabel: '执行批次详情', createLabel: '新建执行批次', editLabel: '编辑执行批次' },
  { base: '/dashboard/dispatch-notices', section: '采销管理', listLabel: '执行通知管理', detailLabel: '执行通知详情', createLabel: '新建执行通知' },
  { base: '/dashboard/waybills', section: '物流管理', listLabel: '运单管理', detailLabel: '物流运单详情', createLabel: '新建物流运单' },
  { base: '/dashboard/inbound', section: '库存管理', listLabel: '入库单管理', detailLabel: '入库单详情', createLabel: '入库单生成说明' },
  { base: '/dashboard/outbound', section: '库存管理', listLabel: '出库单管理', detailLabel: '出库单详情', createLabel: '完善出库作业' },
  { base: '/dashboard/inventory-reversals', section: '库存管理', listLabel: '库存冲销', detailLabel: '库存冲销单详情', createLabel: '新建库存冲销单' },
  { base: '/dashboard/quality', section: '质检影像', listLabel: '质检管理', detailLabel: '质检任务详情', createLabel: '追加检测报告' },
];

function withHome(items: BreadcrumbItem[]): BreadcrumbItem[] {
  return [{ ...HOME }, ...items];
}

function resolveResource(pathname: string, route: ResourceRoute): BreadcrumbItem[] | null {
  if (pathname !== route.base && !pathname.startsWith(`${route.base}/`)) return null;
  const list = { label: route.listLabel, href: route.base };
  if (pathname === route.base) return withHome([{ label: route.section }, { label: route.listLabel }]);
  if (pathname === `${route.base}/create` && route.createLabel) {
    return withHome([{ label: route.section }, list, { label: route.createLabel }]);
  }

  const suffix = pathname.slice(route.base.length + 1).split('/').filter(Boolean);
  if (suffix.length === 1 && pathname.startsWith(`${route.base}/`)) {
    return withHome([{ label: route.section }, list, { label: route.detailLabel }]);
  }
  if (suffix.length === 2 && suffix[1] === 'edit' && route.editLabel) {
    return withHome([
      { label: route.section },
      list,
      { label: route.detailLabel, href: `${route.base}/${suffix[0]}` },
      { label: route.editLabel },
    ]);
  }
  return null;
}

function resolveMasterData(pathname: string, params?: BreadcrumbSearchParams): BreadcrumbItem[] | null {
  const root: BreadcrumbItem = { label: '主数据管理' };
  if (pathname === '/dashboard/master-data') {
    const tab = params?.get('tab') || 'partners';
    return withHome([root, { label: MASTER_DATA_TABS[tab] || '合作伙伴' }]);
  }

  if (pathname === '/dashboard/master-data/material-categories') {
    return withHome([
      root,
      { label: '商品物料', href: '/dashboard/master-data?tab=materials' },
      { label: '物料分类管理' },
    ]);
  }

  const serviceBase = '/dashboard/master-data/service-organizations';
  if (pathname === serviceBase) {
    const type = params?.get('type') || 'LOGISTICS_CARRIER';
    return withHome([
      root,
      { label: '服务生态', href: serviceBase },
      { label: SERVICE_ORGANIZATION_TYPES[type] || '物流承运商' },
    ]);
  }
  if (pathname === `${serviceBase}/new`) {
    const type = params?.get('type') || 'LOGISTICS_CARRIER';
    return withHome([
      root,
      { label: '服务生态', href: `${serviceBase}?type=${type}` },
      { label: `新建${SERVICE_ORGANIZATION_TYPES[type] || '服务组织'}` },
    ]);
  }
  const serviceMatch = pathname.match(/^\/dashboard\/master-data\/service-organizations\/([^/]+)\/(edit|drivers)$/);
  if (serviceMatch) {
    if (serviceMatch[2] === 'drivers') {
      return withHome([
        root,
        { label: '服务生态', href: `${serviceBase}?type=LOGISTICS_CARRIER` },
        { label: '物流承运商' },
        { label: '司机管理' },
      ]);
    }
    return withHome([
      root,
      { label: '服务生态', href: serviceBase },
      { label: '编辑服务组织' },
    ]);
  }

  const entityConfig: Record<string, { label: string; tab: string; detail: string; create: string; edit: string }> = {
    partners: { label: '合作伙伴', tab: 'partners', detail: '合作伙伴详情', create: '新增合作伙伴', edit: '编辑合作伙伴' },
    materials: { label: '商品物料', tab: 'materials', detail: '商品物料详情', create: '新建商品物料', edit: '维护商品物料' },
    warehouses: { label: '仓库管理', tab: 'warehouses', detail: '仓库详情', create: '新增仓库', edit: '编辑仓库' },
    vehicles: { label: '车辆管理', tab: 'vehicles', detail: '车辆详情', create: '新建车辆', edit: '编辑车辆' },
  };
  const entityMatch = pathname.match(/^\/dashboard\/master-data\/(partners|materials|warehouses|vehicles)\/([^/]+)(?:\/(edit))?$/);
  if (!entityMatch) return null;
  const [, entity, value, edit] = entityMatch;
  const config = entityConfig[entity];
  const list: BreadcrumbItem = { label: config.label, href: `/dashboard/master-data?tab=${config.tab}` };
  if (value === 'new') return withHome([root, list, { label: config.create }]);
  if (edit) {
    const detailExists = entity !== 'warehouses';
    return withHome([
      root,
      list,
      ...(detailExists ? [{ label: config.detail, href: `/dashboard/master-data/${entity}/${value}` }] : []),
      { label: config.edit },
    ]);
  }
  return withHome([root, list, { label: config.detail }]);
}

function resolveProduction(pathname: string): BreadcrumbItem[] | null {
  const section: BreadcrumbItem = { label: '生产管理' };
  const tasks: BreadcrumbItem = { label: '生产任务', href: '/dashboard/production' };
  const recipes: BreadcrumbItem = { label: '生产方案', href: '/dashboard/production/recipes' };
  if (pathname === '/dashboard/production') return withHome([section, { label: '生产任务' }]);
  if (pathname === '/dashboard/production/new') return withHome([section, tasks, { label: '新建生产任务' }]);
  if (pathname === '/dashboard/production/ledger') return withHome([section, { label: '生产台账' }]);
  if (pathname === '/dashboard/production/recipes') return withHome([section, { label: '生产方案' }]);
  if (pathname === '/dashboard/production/recipes/new') return withHome([section, recipes, { label: '新建生产方案' }]);
  if (/^\/dashboard\/production\/recipes\/[^/]+\/edit$/.test(pathname)) {
    return withHome([section, recipes, { label: '编辑生产方案' }]);
  }
  if (/^\/dashboard\/production\/[^/]+$/.test(pathname)) {
    return withHome([section, tasks, { label: '生产任务详情' }]);
  }
  return null;
}

function resolveWeighbridge(pathname: string): BreadcrumbItem[] | null {
  const section: BreadcrumbItem = { label: '质检影像' };
  const list: BreadcrumbItem = { label: '磅单管理', href: '/dashboard/weighbridge' };
  if (pathname === '/dashboard/weighbridge') return withHome([section, { label: '磅单管理' }]);
  if (pathname === '/dashboard/weighbridge/create') return withHome([section, list, { label: '新建或追加磅单' }]);
  if (/^\/dashboard\/weighbridge\/management\/[^/]+$/.test(pathname)) {
    return withHome([section, list, { label: '磅单归集详情' }]);
  }
  if (/^\/dashboard\/weighbridge\/[^/]+$/.test(pathname)) {
    return withHome([section, list, { label: '称重磅单详情' }]);
  }
  return null;
}

function resolveOrganization(pathname: string, params?: BreadcrumbSearchParams): BreadcrumbItem[] | null {
  const root: BreadcrumbItem = { label: '组织数据' };
  if (pathname === '/dashboard/org') {
    const tab = params?.get('tab') || 'company';
    return withHome([root, { label: ORGANIZATION_TABS[tab] || '企业维护' }]);
  }
  if (/^\/dashboard\/org\/employees\/[^/]+$/.test(pathname)) {
    return withHome([
      root,
      { label: '员工管理', href: '/dashboard/org?tab=employee' },
      { label: '员工详情' },
    ]);
  }
  return null;
}

function resolveBreadcrumbs(pathname: string, params?: BreadcrumbSearchParams): BreadcrumbResult {
  if (pathname === '/dashboard') return { items: [{ label: '首页' }], supported: true };

  const masterData = resolveMasterData(pathname, params);
  if (masterData) return { items: masterData, supported: true };
  const organization = resolveOrganization(pathname, params);
  if (organization) return { items: organization, supported: true };
  const production = resolveProduction(pathname);
  if (production) return { items: production, supported: true };
  const weighbridge = resolveWeighbridge(pathname);
  if (weighbridge) return { items: weighbridge, supported: true };

  for (const route of RESOURCE_ROUTES) {
    const items = resolveResource(pathname, route);
    if (items) return { items, supported: true };
  }

  const exactRoutes: Record<string, BreadcrumbItem[]> = {
    '/dashboard/dispatch': [{ label: '物流管理' }, { label: '调度看板' }],
    '/dashboard/logistics-reconciliation': [{ label: '物流管理' }, { label: '物流对账' }],
    '/dashboard/inventory': [{ label: '库存管理' }, { label: '在库总览' }],
    '/dashboard/monitor': [{ label: '质检影像' }, { label: '监控录像' }],
    '/dashboard/settlement': [{ label: '结算中心' }, { label: '应收管理' }],
    '/dashboard/payables': [{ label: '结算中心' }, { label: '应付管理' }],
    '/dashboard/system/access-control': [{ label: '系统管理' }, { label: '用户与权限' }],
    '/dashboard/system/approvals': [{ label: '系统管理' }, { label: '审批流程' }],
    '/dashboard/content/articles': [{ label: '内容运营中心' }, { label: '资讯管理' }],
    '/dashboard/content/supply-demand': [{ label: '内容运营中心' }, { label: '供需信息' }],
    '/dashboard/content/prices': [{ label: '内容运营中心' }, { label: '价格行情' }],
    '/dashboard/content/contacts': [{ label: '内容运营中心' }, { label: '官网咨询' }],
    '/dashboard/content/data-sources': [{ label: '内容运营中心' }, { label: '数据源管理' }],
    '/dashboard/content/jobs': [{ label: '内容运营中心' }, { label: '采集与 AI' }],
    '/dashboard/users': [{ label: '用户管理中心' }, { label: '个人用户' }],
  };
  if (exactRoutes[pathname]) return { items: withHome(exactRoutes[pathname]), supported: true };

  return { items: withHome([{ label: '当前页面' }]), supported: false };
}

export function buildBreadcrumbs(pathname: string, params?: BreadcrumbSearchParams): BreadcrumbItem[] {
  return resolveBreadcrumbs(pathname, params).items;
}

export function isBreadcrumbRouteSupported(pathname: string, params?: BreadcrumbSearchParams): boolean {
  return resolveBreadcrumbs(pathname, params).supported;
}
