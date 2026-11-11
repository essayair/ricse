/** 业务服务档案名称与开票、收付款使用的合作伙伴法定名称分开。 */
type ServiceName = { name?: string | null; partner?: { name: string } | null };
export function serviceOrganizationName(item: ServiceName | null | undefined) {
  return item?.name?.trim() || item?.partner?.name || '未命名服务商';
}
export function serviceOrganizationLabel(item: ServiceName) {
  const name = serviceOrganizationName(item);
  return item.partner?.name && name !== item.partner.name ? `${name}（${item.partner.name}）` : name;
}
