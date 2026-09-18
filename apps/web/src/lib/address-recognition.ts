import areaData from 'china-area-data';

type AreaMap = Record<string, Record<string, string>>;

const AREAS = areaData as unknown as AreaMap;
const MUNICIPALITIES = new Set(['北京市', '天津市', '上海市', '重庆市']);

interface RegionPath {
  province: string;
  city: string;
  district: string;
  provinceAliases: string[];
  cityAliases: string[];
  districtAliases: string[];
}

export interface RecognizedPartnerAddress {
  addressName: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  contactPerson: string;
  contactPhone: string;
  recognizedFields: string[];
}

let regionPaths: RegionPath[] | null = null;

export function recognizePartnerAddress(text: string): RecognizedPartnerAddress {
  const source = text.replace(/\r/g, '\n').trim();
  const phoneMatch = source.match(/(?:\+?86[\s-]?)?(1[3-9]\d{9})(?!\d)/)
    || source.match(/(?:^|\D)(0\d{2,3}[\s-]?\d{7,8})(?!\d)/);
  const contactPhone = phoneMatch?.[1]?.replace(/[\s-]/g, '') || '';
  const contactPerson = extractContactPerson(source, phoneMatch?.index);
  const explicitName = source.match(/(?:地址简称|地址名称)\s*[:：]?\s*([^,，;；\n]{1,50})/i)?.[1]?.trim() || '';
  const region = matchRegion(source);
  const addressName = explicitName || (region?.district ? `${region.district}收发货地址` : '');
  const detailAddress = extractDetailAddress(source, {
    phone: phoneMatch?.[0] || '', contactPerson, explicitName,
    province: region?.province || '', city: region?.city || '', district: region?.district || '',
  });
  const recognizedFields: string[] = [];
  if (addressName) recognizedFields.push('地址简称');
  if (region?.province) recognizedFields.push('省');
  if (region?.city) recognizedFields.push('市');
  if (region?.district) recognizedFields.push('区县');
  if (detailAddress) recognizedFields.push('详细地址');
  if (contactPerson) recognizedFields.push('联系人');
  if (contactPhone) recognizedFields.push('联系方式');

  return {
    addressName,
    province: region?.province || '',
    city: region?.city || '',
    district: region?.district || '',
    detailAddress,
    contactPerson,
    contactPhone,
    recognizedFields,
  };
}

function extractContactPerson(source: string, phoneIndex?: number) {
  const labeled = source.match(/(?:联系人|收货人|发货人|姓名)\s*[:：]?\s*([\u3400-\u9fff·]{2,10}?)(?=\s*(?:[,，;；\n]|手机|电话|联系方式|(?:\+?86[\s-]?)?1[3-9]\d{9}|$))/);
  if (labeled?.[1]) return labeled[1].trim();
  if (phoneIndex === undefined) return '';
  const beforePhone = source.slice(Math.max(0, phoneIndex - 24), phoneIndex)
    .replace(/(?:联系人|收货人|发货人|姓名|手机|电话|联系方式)\s*[:：]?\s*/g, ' ')
    .replace(/[\s,，;；:：]+$/, '');
  return beforePhone.match(/(?:^|[\s,，;；])([\u3400-\u9fff·]{2,6})\s*$/)?.[1] || '';
}

function matchRegion(source: string) {
  let best: { path: RegionPath; score: number } | null = null;
  for (const path of getRegionPaths()) {
    const provinceHit = longestHit(source, path.provinceAliases);
    const cityHit = longestHit(source, path.cityAliases);
    const districtHit = longestHit(source, path.districtAliases);
    if (!provinceHit && !cityHit && !districtHit) continue;
    if (districtHit && !provinceHit && !cityHit && isAmbiguousDistrict(path.district)) continue;
    const score = (provinceHit ? 100 + provinceHit.length : 0)
      + (cityHit ? 200 + cityHit.length : 0)
      + (districtHit ? 400 + districtHit.length : 0);
    if (!best || score > best.score) best = { path, score };
  }
  return best?.path || null;
}

function getRegionPaths() {
  if (regionPaths) return regionPaths;
  regionPaths = [];
  for (const [provinceCode, province] of Object.entries(AREAS['86'] || {})) {
    const cities = Object.entries(AREAS[provinceCode] || {});
    for (const [cityCode, rawCity] of cities) {
      const city = rawCity === '市辖区' && MUNICIPALITIES.has(province) ? province : rawCity;
      const districts = Object.values(AREAS[cityCode] || {});
      if (!districts.length) {
        regionPaths.push({ province, city, district: '', provinceAliases: aliases(province), cityAliases: aliases(city), districtAliases: [] });
        continue;
      }
      for (const district of districts) {
        regionPaths.push({ province, city, district, provinceAliases: aliases(province), cityAliases: aliases(city), districtAliases: aliases(district) });
      }
    }
  }
  return regionPaths;
}

function aliases(name: string) {
  const short = name
    .replace(/特别行政区$/, '')
    .replace(/维吾尔自治区$/, '')
    .replace(/壮族自治区$/, '')
    .replace(/回族自治区$/, '')
    .replace(/自治区$/, '')
    .replace(/自治州$/, '')
    .replace(/(?:省|市|地区|盟|区|县|旗)$/, '');
  return [...new Set([name, short].filter(item => item.length >= 2))].sort((a, b) => b.length - a.length);
}

function longestHit(source: string, values: string[]) {
  return values.find(value => source.includes(value)) || '';
}

function isAmbiguousDistrict(district: string) {
  return getRegionPaths().filter(path => path.district === district).length > 1;
}

function extractDetailAddress(source: string, values: {
  phone: string; contactPerson: string; explicitName: string;
  province: string; city: string; district: string;
}) {
  let detail = source;
  detail = detail.replace(/(?:地址简称|地址名称)\s*[:：]?\s*[^,，;；\n]{1,50}/gi, ' ');
  detail = detail.replace(/(?:联系人|收货人|发货人|姓名)\s*[:：]?\s*[\u3400-\u9fff·]{2,10}/g, ' ');
  for (const value of [values.phone, values.contactPerson, values.explicitName]) {
    if (value) detail = detail.replace(new RegExp(escapeRegExp(value), 'g'), ' ');
  }
  for (const region of [values.province, values.city, values.district]) {
    for (const value of aliases(region)) detail = detail.replace(new RegExp(escapeRegExp(value), 'g'), ' ');
  }
  detail = detail
    .replace(/(?:收货地址|发货地址|详细地址|联系地址|所在地址|地址|手机号码|手机号|联系电话|联系方式|手机|电话)\s*[:：]?/g, ' ')
    .replace(/[，,；;|｜\n\t]+/g, ' ')
    .replace(/\s+/g, '')
    .replace(/^[-—:：]+|[-—:：]+$/g, '');
  return detail.slice(0, 160);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
