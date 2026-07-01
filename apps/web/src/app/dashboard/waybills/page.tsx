'use client';

export default function WaybillsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">运单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理运输运单，跟踪货物运输状态和签收信息</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        运单列表及相关操作将在此处显示
      </div>
    </div>
  );
}
