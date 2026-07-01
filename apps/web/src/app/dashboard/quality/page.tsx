'use client';

export default function QualityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">质检单管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理货物质量检验单据，记录质检结果和判定信息</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        质检单列表及相关操作将在此处显示
      </div>
    </div>
  );
}
