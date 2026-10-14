import { IndustryRecordsPage } from '@/components/industry-database/industry-records-page';

export default function Page() {
  return <IndustryRecordsPage config={{
    title: '氟化工生产企业',
    description: '维护无水氟化氢、氟化盐、制冷剂及含氟材料等生产企业资料',
    endpoint: '/industry-database/fluorochemical-producers',
    nameLabel: '企业名称',
    fields: [
      { key: 'shortName', label: '企业简称' },
      { key: 'productCategories', label: '产品类别', type: 'tags', list: true },
      { key: 'mainProducts', label: '主要产品', type: 'tags', list: true },
    ],
  }} />;
}
