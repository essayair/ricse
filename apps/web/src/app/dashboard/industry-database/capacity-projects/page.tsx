import { IndustryRecordsPage } from '@/components/industry-database/industry-records-page';

export default function Page() {
  return <IndustryRecordsPage config={{
    title: '产能与项目',
    description: '按企业、生产基地、产品和年度维护设计产能、有效产能及规划项目',
    endpoint: '/industry-database/capacity-projects',
    nameLabel: '基地或项目名称',
    fields: [
      { key: 'companyName', label: '企业名称', required: true, list: true },
      { key: 'productName', label: '产品名称', required: true, list: true },
      { key: 'designCapacity', label: '设计产能', type: 'number', list: true },
      { key: 'effectiveCapacity', label: '有效产能', type: 'number' },
      { key: 'plannedCapacity', label: '规划产能', type: 'number' },
      { key: 'capacityUnit', label: '产能单位', placeholder: '万吨/年' },
      { key: 'commissioningDate', label: '投产日期', type: 'date' },
    ],
  }} />;
}
