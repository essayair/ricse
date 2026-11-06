import { SettlementLedger } from '@/components/settlement/settlement-ledger';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function PayableLedgerPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="payable" showPageTitle/><SettlementLedger direction="PAYABLE" showTitle={false}/></div>;
}
