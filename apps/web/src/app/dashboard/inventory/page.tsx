'use client';

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">在库总览</h1>
        <p className="text-sm text-muted-foreground mt-1">实时查看库存总量、库存分布和库存预警信息</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        库存总览数据将在此处展示
      </div>
    </div>
  );
}
