import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceOrganizationLabel, serviceOrganizationName } from './service-organization';
test('优先显示服务名称，关联主体不同名时同时标注主体', () => {
  const item = { name: '龙游检测中心', partner: { name: '检测技术有限公司' } };
  assert.equal(serviceOrganizationName(item), '龙游检测中心');
  assert.equal(serviceOrganizationLabel(item), '龙游检测中心（检测技术有限公司）');
});
test('同名不重复展示，旧接口缺名称时兼容合作伙伴名称', () => {
  assert.equal(serviceOrganizationLabel({ name: '检测公司', partner: { name: '检测公司' } }), '检测公司');
  assert.equal(serviceOrganizationName({ partner: { name: '旧公司' } }), '旧公司');
});
