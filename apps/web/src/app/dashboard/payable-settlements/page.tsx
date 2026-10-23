import { SettlementWorkbench } from '@/components/settlement/settlement-workbench';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function PayableSettlementsPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="payable" showPageTitle/><SettlementWorkbench direction="PAYABLE" standalone showTitle={false}/></div>;
}
