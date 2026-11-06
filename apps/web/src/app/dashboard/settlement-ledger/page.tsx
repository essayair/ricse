import { redirect } from 'next/navigation';

/** 原“结算台账”已按方向拆分为应付台账与应收台账；保留旧地址兼容书签。 */
export default function SettlementLedgerPage() { redirect('/dashboard/payable-ledger'); }
