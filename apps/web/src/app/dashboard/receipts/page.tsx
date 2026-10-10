import { FundWorkbench } from '@/components/settlement/fund-workbench';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function ReceiptsPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="receivable"/><FundWorkbench direction="RECEIPT" /></div>;
}
