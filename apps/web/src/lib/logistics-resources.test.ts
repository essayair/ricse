import assert from 'node:assert/strict';
import test from 'node:test';
import { driverMatchesTransport, vehicleMatchesTransport } from './logistics-resources';

const choice = { freightMode: 'THIRD_PARTY', carrierPartnerId: 'carrier' };
const fleet = { fleet: { carrierPartnerId: 'carrier', status: 'ACTIVE', deletedAt: null } };
test('承运商必须先确定，不展示其他承运商司机或车辆', () => {
  assert.equal(driverMatchesTransport({ serviceOrganization: null }, choice), false);
  assert.equal(vehicleMatchesTransport({ ownerType: 'OUTSOURCED', owner: { id: 'other' } }, choice), false);
  assert.equal(vehicleMatchesTransport({ ownerType: 'OUTSOURCED', owner: { id: 'carrier' } }, { ...choice, carrierPartnerId: '' }), false);
});
test('直接归属和有效车队继承关系都可选', () => {
  assert.equal(driverMatchesTransport({ serviceOrganization: { partnerId: 'carrier', partner: { isInternal: false } } }, choice), true);
  assert.equal(driverMatchesTransport({ serviceOrganization: null, fleetLinks: [fleet] }, choice), true);
  assert.equal(vehicleMatchesTransport({ ownerType: 'NONE', fleetLinks: [fleet] }, choice), true);
});
test('停用、删除或未绑定承运商的车队不提供继承关系', () => {
  for (const patch of [{ status: 'INACTIVE' }, { deletedAt: '2026-10-23' }, { carrierPartnerId: null }]) {
    assert.equal(driverMatchesTransport({ serviceOrganization: null, fleetLinks: [{ fleet: { ...fleet.fleet, ...patch } }] }, choice), false);
  }
});
test('社会运力不限制归属；内部运力只使用内部司机及自有车辆', () => {
  assert.equal(driverMatchesTransport({ serviceOrganization: null }, { ...choice, freightMode: 'SOCIAL' }), true);
  assert.equal(vehicleMatchesTransport({ ownerType: 'NONE' }, { ...choice, freightMode: 'SOCIAL' }), true);
  assert.equal(driverMatchesTransport({ serviceOrganization: { partnerId: 'internal', partner: { isInternal: true } } }, { ...choice, freightMode: 'SELF' }), true);
  assert.equal(vehicleMatchesTransport({ ownerType: 'SELF' }, { ...choice, freightMode: 'SELF' }), true);
});
test('司机所属机构停用时不进入候选，避免提交后才被拒绝', () => {
  assert.equal(driverMatchesTransport({ serviceOrganization: { status: 'INACTIVE', partnerId: 'carrier', partner: { isInternal: false } }, fleetLinks: [fleet] }, choice), false);
});
