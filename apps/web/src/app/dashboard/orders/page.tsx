'use client';

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">订单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理所有业务订单，包括查看、编辑、审核和跟踪订单状态</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        订单列表及管理操作将在此处显示
      </div>
    </div>
  );
}
