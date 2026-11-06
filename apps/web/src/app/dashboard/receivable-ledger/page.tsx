import { SettlementLedger } from '@/components/settlement/settlement-ledger';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function ReceivableLedgerPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="receivable" showPageTitle/><SettlementLedger direction="RECEIVABLE" showTitle={false}/></div>;
}
