'use client';

export default function OutboundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">出库单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理货物出库单据，处理出库审核和发货确认</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        出库单列表及相关操作将在此处显示
      </div>
    </div>
  );
}
