import { IndustryRecordsPage } from '@/components/industry-database/industry-records-page';

export default function Page() {
  return <IndustryRecordsPage config={{
    title: '氟化工产业园区',
    description: '维护产业园区、重点产业方向和静态地理位置信息',
    endpoint: '/industry-database/parks',
    nameLabel: '园区名称',
    fields: [
      { key: 'level', label: '园区级别', list: true },
      { key: 'focusIndustries', label: '重点产业方向', type: 'tags', list: true },
      { key: 'latitude', label: '纬度', type: 'number' },
      { key: 'longitude', label: '经度', type: 'number' },
    ],
  }} />;
}
