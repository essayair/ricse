import { IndustryRecordsPage } from '@/components/industry-database/industry-records-page';

export default function Page() {
  return <IndustryRecordsPage config={{
    title: '萤石生产企业',
    description: '维护从事萤石开采、选矿和精粉生产的产业企业资料，不等同于采购供应商',
    endpoint: '/industry-database/fluorite-producers',
    nameLabel: '企业名称',
    fields: [
      { key: 'shortName', label: '企业简称' },
      { key: 'mainProducts', label: '主要产品', type: 'tags', list: true },
      { key: 'designCapacity', label: '设计产能', type: 'number', list: true },
      { key: 'effectiveCapacity', label: '有效产能', type: 'number' },
      { key: 'capacityUnit', label: '产能单位', placeholder: '万吨/年' },
    ],
  }} />;
}
