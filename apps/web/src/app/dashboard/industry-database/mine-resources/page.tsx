import { IndustryRecordsPage } from '@/components/industry-database/industry-records-page';

export default function Page() {
  return <IndustryRecordsPage config={{
    title: '矿山与资源',
    description: '维护具体矿山、矿区、资源项目及其运营和资源信息',
    endpoint: '/industry-database/mine-resources',
    nameLabel: '矿山或项目名称',
    listColumns: ['name', 'province', 'city', 'district', 'latitude', 'longitude', 'mineralType', 'operatorName', 'status'],
    fields: [
      { key: 'operatorName', label: '运营企业', list: true },
      { key: 'mineralType', label: '矿种或资源类型', list: true },
      { key: 'reserveAmount', label: '资源储量', type: 'number', list: true },
      { key: 'reserveUnit', label: '储量单位', placeholder: '万吨' },
      { key: 'averageGrade', label: '平均品位（%）', type: 'number' },
      { key: 'miningCapacity', label: '采选能力', type: 'number' },
      { key: 'capacityUnit', label: '能力单位', placeholder: '万吨/年' },
      { key: 'district', label: '区/县', placeholder: '例如：武义县' },
      { key: 'latitude', label: '纬度', type: 'number', placeholder: '例如：29.000000' },
      { key: 'longitude', label: '经度', type: 'number', placeholder: '例如：118.900000' },
    ],
  }} />;
}
