import { InvoiceLedger } from '@/components/settlement/invoice-ledger';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function InputInvoicesPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="payable" showPageTitle/><InvoiceLedger direction="INPUT"/></div>;
}
