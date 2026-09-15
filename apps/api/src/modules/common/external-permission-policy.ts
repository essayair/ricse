const EXTERNAL_BUSINESS_PERMISSION_PREFIXES = [
  'contract.',
  'execution.',
  'logistics.',
  'quality.',
  'inventory.',
] as const;

/**
 * 外部企业账号试运行阶段只开放合同至出入库业务链权限。
 * 即使误配了包含主数据、组织或系统权限的角色，也由服务端硬边界拦截。
 */
export function isExternalBusinessPermission(permissionCode: string) {
  return EXTERNAL_BUSINESS_PERMISSION_PREFIXES.some((prefix) => permissionCode.startsWith(prefix));
}
