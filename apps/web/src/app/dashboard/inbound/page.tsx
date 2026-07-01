'use client';

export default function InboundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">入库单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理货物入库单据，记录入库验收和上架信息</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        入库单列表及相关操作将在此处显示
      </div>
    </div>
  );
}
