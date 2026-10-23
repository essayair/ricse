/** 单组司机/车辆文字提取；纯本地规则，不向第三方发送证件或联系方式。 */
export function recognizeTransportResource(raw: string) {
  const text = raw.normalize('NFKC').replace(/[：]/g, ':');
  const driver: Record<string, string> = {}, vehicle: Record<string, string | number> = {};
  const warnings: string[] = [];
  const fields = ['司机姓名', '驾驶员姓名', '司机', '驾驶员', '姓名', '司机手机号', '司机电话', '联系电话', '手机号', '电话', '手机', '身份证号', '身份证', '驾驶证号', '驾驶证', '准驾车型', '驾驶证有效期', '车牌号码', '车牌号', '车牌', '车型', '车辆类型', '品牌型号', '车辆品牌', '品牌', '核定载重', '核载', '载重', '载质量', '整备质量', '皮重', '车主姓名', '车主电话', '车主手机', '行驶证号', '承运商', '承运单位', '物流公司'];
  const fieldPattern = fields.sort((a, b) => b.length - a.length).join('|');
  const value = (...labels: string[]) => {
    const match = text.match(new RegExp(`(?:^|[\\s,，;；])(?:${labels.join('|')})(?:\\s*:\\s*|\\s+)(.+?)(?=[,，;；\\n\\r]|\\s+(?:${fieldPattern})\\s*:?|$)`, 'im'));
    return match?.[1]?.trim();
  };
  const phones = [...new Set(text.match(/(?<!\d)1[3-9]\d{9}(?!\d)/g) || [])];
  const phone = value('司机手机号', '司机电话', '联系电话', '手机号', '电话', '手机')?.replace(/[\s-]/g, '');
  if (phone && /^1[3-9]\d{9}$/.test(phone)) driver.phone = phone;
  else if (phones.length === 1 && !value('车主电话', '车主手机')) driver.phone = phones[0];
  else if (phones.length > 1) warnings.push('发现多个手机号，未自动确定司机手机号，请核对填写。');
  const name = value('司机姓名', '驾驶员姓名', '司机', '驾驶员', '姓名')?.match(/^[\u4e00-\u9fff·]{2,20}/)?.[0];
  if (name) driver.name = name;
  else if (driver.phone) {
    const informal = text.match(new RegExp(`(?:^|[\\s,，;；])([\\u4e00-\\u9fff·]{2,8})[\\s,，;；]+${driver.phone}(?!\\d)`));
    if (informal) driver.name = informal[1];
  }
  const identity = value('身份证号', '身份证')?.replace(/\s/g, '').match(/^\d{17}[\dXx]/)?.[0];
  if (identity) driver.idCardNo = identity.toUpperCase();
  const license = value('驾驶证号', '驾驶证');
  if (license && /^[A-Z0-9]{5,50}$/i.test(license)) driver.licenseNo = license.toUpperCase();
  const licenseClass = value('准驾车型')?.toUpperCase().match(/^(?:A[123]|B[12]|C[123456]|[DEFMPN])/i)?.[0];
  if (licenseClass) driver.licenseClass = licenseClass;
  const expiry = value('驾驶证有效期')?.match(/(?:至|到)?\s*(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})/);
  if (expiry) driver.licenseExpiry = `${expiry[1]}-${expiry[2].padStart(2, '0')}-${expiry[3].padStart(2, '0')}`;

  const plates = [...new Set((text.match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][\s·•-]*[A-Z][\s·•-]*[A-Z0-9挂学警港澳]{5,6}(?![A-Z0-9])/gi) || []).map(p => p.replace(/[\s·•-]/g, '').toUpperCase()))];
  if (plates.length === 1) vehicle.plateNo = plates[0];
  if (plates.length > 1) warnings.push('发现多个车牌，一次只能登记一组司机/车辆，请拆分后识别。');
  const typeText = value('车辆类型', '车型') || text;
  const types = [['超重.*半挂|重型半挂', 'HEAVY_SEMI_TRAILER'], ['半挂', 'SEMI_TRAILER'], ['厢式|箱式', 'BOX_TRUCK'], ['自卸', 'DUMP_TRUCK'], ['槽罐|罐车', 'TANK_TRUCK']];
  const vehicleType = types.find(([pattern]) => new RegExp(pattern).test(typeText));
  if (vehicleType) vehicle.vehicleType = vehicleType[1];
  const weight = (labels: string[]) => {
    const part = value(...labels);
    const match = part?.match(/^([\d.]+)\s*(吨|[tT]|千克|公斤|[kK][gG])?/);
    if (!match) return undefined;
    const number = Number(match[1]) / (/千克|公斤|kg/i.test(match[2] || '') ? 1000 : 1);
    if (!Number.isFinite(number) || number < 0) return undefined;
    if (!match[2]) warnings.push(`${labels[0]}未标明单位，暂按吨填入，请核对。`);
    return number;
  };
  const load = weight(['核定载重', '核载', '载重', '载质量']);
  const tare = weight(['整备质量', '皮重']);
  if (load !== undefined) vehicle.loadCapacity = load;
  if (tare !== undefined) vehicle.tareWeight = tare;
  const brand = value('品牌型号', '车辆品牌', '品牌');
  if (brand) vehicle.brand = brand.slice(0, 100);
  const ownerName = value('车主姓名'); if (ownerName) vehicle.ownerName = ownerName.slice(0, 50);
  const ownerPhone = value('车主电话', '车主手机')?.replace(/[\s-]/g, '');
  if (ownerPhone && /^1[3-9]\d{9}$/.test(ownerPhone)) vehicle.ownerPhone = ownerPhone;
  const vehicleLicense = value('行驶证号'); if (vehicleLicense) vehicle.licenseNo = vehicleLicense.slice(0, 100);
  const carrierName = value('承运商', '承运单位', '物流公司');
  return { driver, vehicle, carrierName, warnings, matchedFields: Object.keys(driver).length + Object.keys(vehicle).length + (carrierName ? 1 : 0) };
}
