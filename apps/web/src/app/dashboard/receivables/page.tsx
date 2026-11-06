import { SettlementWorkbench } from '@/components/settlement/settlement-workbench';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function ReceivablesPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="receivable" showPageTitle/><SettlementWorkbench direction="RECEIVABLE" standalone showTitle={false}/></div>;
}
