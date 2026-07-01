'use client';

export default function WeighbridgePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">磅单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理地磅称重记录，查看称重数据和磅单报表</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        磅单记录及称重数据将在此处展示
      </div>
    </div>
  );
}
