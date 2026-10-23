import { FundWorkbench } from '@/components/settlement/fund-workbench';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function PaymentsPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="payable" showPageTitle/><FundWorkbench direction="PAYMENT" showTitle={false}/></div>;
}
