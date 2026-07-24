import { PartnerController } from './partner.controller';

describe('PartnerController route order', () => {
  it('车辆列表静态路由应在合作伙伴详情动态路由之前注册', () => {
    const methods = Object.getOwnPropertyNames(PartnerController.prototype);
    expect(methods.indexOf('findAllVehicles')).toBeGreaterThan(-1);
    expect(methods.indexOf('findAllVehicles')).toBeLessThan(methods.indexOf('findOne'));
  });
});
