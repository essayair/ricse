import { InvoiceLedger } from '@/components/settlement/invoice-ledger';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function OutputInvoicesPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="receivable" showPageTitle/><InvoiceLedger direction="OUTPUT"/></div>;
}
