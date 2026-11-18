import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBreadcrumbs, isBreadcrumbRouteSupported } from './breadcrumbs';
test('复制新建保留来源合同入口，显示中文面包屑', () => {
  assert.equal(isBreadcrumbRouteSupported('/dashboard/contracts/source-id/copy'), true);
  assert.deepEqual(buildBreadcrumbs('/dashboard/contracts/source-id/copy').slice(-2), [{ label: '来源合同', href: '/dashboard/contracts/source-id' }, { label: '复制新建合同' }]);
});

test('视频监控保留原地址并显示两级中文路径', () => {
  assert.equal(isBreadcrumbRouteSupported('/dashboard/monitor'), true);
  assert.deepEqual(buildBreadcrumbs('/dashboard/monitor'), [
    { label: '首页', href: '/dashboard' },
    { label: '影像监控' },
    { label: '视频监控' },
  ]);
});

test('业务影像具有独立的中文路径', () => {
  assert.equal(isBreadcrumbRouteSupported('/dashboard/business-images'), true);
  assert.deepEqual(buildBreadcrumbs('/dashboard/business-images'), [
    { label: '首页', href: '/dashboard' },
    { label: '影像监控' },
    { label: '业务影像' },
  ]);
});

test('归档业务影像页面包含资料库返回入口', () => {
  assert.equal(isBreadcrumbRouteSupported('/dashboard/business-images/new'), true);
  assert.deepEqual(buildBreadcrumbs('/dashboard/business-images/new').slice(-2), [
    { label: '业务影像', href: '/dashboard/business-images' },
    { label: '归档资料' },
  ]);
});
