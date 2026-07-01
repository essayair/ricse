'use client';

export default function DispatchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">调度看板</h1>
        <p className="text-sm text-muted-foreground mt-1">实时查看车辆调度状态，管理运输任务分配和路线规划</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        调度看板数据将在此处展示
      </div>
    </div>
  );
}
