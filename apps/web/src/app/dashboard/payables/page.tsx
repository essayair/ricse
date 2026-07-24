'use client';

export default function PayablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">应付管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理采购业务应付结算、付款申请和付款状态</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        应付结算记录及付款跟踪将在此处显示
      </div>
    </div>
  );
}
