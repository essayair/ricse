'use client';

export default function SettlementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">应收管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理销售业务应收结算、应收确认和回款状态</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        应收结算记录及回款跟踪将在此处显示
      </div>
    </div>
  );
}
