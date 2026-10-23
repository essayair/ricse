import { PaymentRequestWorkbench } from '@/components/settlement/payment-request-workbench';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';

export default function PaymentRequestsPage() {
  return <div className="space-y-5"><SettlementSectionTabs section="payable" showPageTitle/><PaymentRequestWorkbench showTitle={false}/></div>;
}
