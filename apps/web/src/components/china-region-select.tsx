'use client';

import areaData from 'china-area-data';

type AreaMap = Record<string, Record<string, string>>;
const AREAS = areaData as unknown as AreaMap;
const MUNICIPALITIES = new Set(['北京市', '天津市', '上海市', '重庆市']);

export interface ChinaRegionValue {
  province: string;
  city: string;
  district: string;
}

export function ChinaRegionSelect({ value, onChange }: {
  value: ChinaRegionValue;
  onChange: (value: ChinaRegionValue) => void;
}) {
  const provinces = entries('86');
  const provinceCode = findCode(provinces, value.province);
  const cities = provinceCode ? entries(provinceCode) : [];
  const cityCode = findCityCode(cities, value.city, value.province);
  const districts = cityCode ? entries(cityCode) : [];
  const districtCode = findCode(districts, value.district);

  const selectProvince = (code: string) => {
    onChange({ province: AREAS['86']?.[code] || '', city: '', district: '' });
  };
  const selectCity = (code: string) => {
    const rawName = AREAS[provinceCode]?.[code] || '';
    const city = rawName === '市辖区' && MUNICIPALITIES.has(value.province) ? value.province : rawName;
    onChange({ ...value, city, district: '' });
  };
  const selectDistrict = (code: string) => onChange({ ...value, district: AREAS[cityCode]?.[code] || '' });

  return <div className="grid gap-3 md:grid-cols-3">
    <RegionSelect label="省" value={provinceCode} onChange={selectProvince} options={provinces} />
    <RegionSelect label="市" value={cityCode} onChange={selectCity} options={cities} disabled={!provinceCode} province={value.province} />
    <RegionSelect label="区 / 县" value={districtCode} onChange={selectDistrict} options={districts} disabled={!cityCode} />
  </div>;
}

function entries(parentCode: string) {
  return Object.entries(AREAS[parentCode] || {});
}

function findCode(options: Array<[string, string]>, name: string) {
  return options.find(([, label]) => label === name)?.[0] || '';
}

function findCityCode(options: Array<[string, string]>, city: string, province: string) {
  return options.find(([, label]) => label === city)?.[0]
    || (MUNICIPALITIES.has(province) && city === province ? options.find(([, label]) => label === '市辖区')?.[0] : '')
    || '';
}

function RegionSelect({ label, value, onChange, options, disabled = false, province = '' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  disabled?: boolean;
  province?: string;
}) {
  return <div>
    <label className="mb-1 block text-sm font-medium">{label} *</label>
    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">请选择{label}</option>
      {options.map(([code, name]) => <option key={code} value={code}>{name === '市辖区' && MUNICIPALITIES.has(province) ? province : name}</option>)}
    </select>
  </div>;
}
