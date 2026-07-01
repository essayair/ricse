'use client';

export default function LogisticsReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">物流对账</h1>
        <p className="text-sm text-muted-foreground mt-1">物流费用对账管理，核对运输费用和结算明细</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        对账数据及报表将在此处展示
      </div>
    </div>
  );
}
