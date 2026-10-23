import { recognizeTransportResource } from './transport-resource-recognition';

describe('司机车辆文字识别（本地规则）', () => {
  it('同一段识别司机、证件、车型、车牌和吨位', () => {
    const r = recognizeTransportResource('司机：张三，手机号：13800138000，身份证号：11010519900101123X，驾驶证号：11010519900101123X，准驾车型：A2\n车牌：甘A12345，车型：半挂车，核定载重：32吨，皮重：15吨，承运商：某某物流');
    expect(r.driver).toMatchObject({ name: '张三', phone: '13800138000', idCardNo: '11010519900101123X', licenseNo: '11010519900101123X', licenseClass: 'A2' });
    expect(r.vehicle).toMatchObject({ plateNo: '甘A12345', vehicleType: 'SEMI_TRAILER', loadCapacity: 32, tareWeight: 15 });
    expect(r.carrierName).toBe('某某物流');
  });
  it('支持没有字段名的常见调度简写；不将身份证中的数字当手机号', () => {
    const r = recognizeTransportResource('浙A12345，李四，13900139000');
    expect(r.driver).toMatchObject({ name: '李四', phone: '13900139000' });
    expect(r.vehicle.plateNo).toBe('浙A12345');
    expect(recognizeTransportResource('身份证号：138001380001234567').driver.phone).toBeUndefined();
  });
  it('公斤转为吨，支持全角标点及小写车牌', () => {
    const r = recognizeTransportResource('司机 张三 手机号 13800138000\n车牌 浙a·12345 核定载重：３２０００公斤 皮重：15000kg');
    expect(r.driver.name).toBe('张三'); expect(r.driver.phone).toBe('13800138000');
    expect(r.vehicle).toMatchObject({ plateNo: '浙A12345', loadCapacity: 32, tareWeight: 15 });
  });
  it('多车牌或多个无标签手机号不随意取第一项，提示拆分核对', () => {
    const r = recognizeTransportResource('甘A12345，浙B54321，13800138000，13900139000');
    expect(r.driver.phone).toBeUndefined(); expect(r.vehicle.plateNo).toBeUndefined(); expect(r.warnings).toHaveLength(2);
  });
  it('车主与司机手机号分开，手机号标签不误识别为司机姓名', () => {
    const r = recognizeTransportResource('司机手机号：13800138000，车主姓名：王五，车主电话：13900139000');
    expect(r.driver.phone).toBe('13800138000'); expect(r.driver.name).toBeUndefined();
    expect(r.vehicle).toMatchObject({ ownerName: '王五', ownerPhone: '13900139000' });
  });
});
