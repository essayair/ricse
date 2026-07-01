'use client';

export default function MonitorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">监控录像</h1>
        <p className="text-sm text-muted-foreground mt-1">查看实时监控画面和历史录像回放</p>
      </div>
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        监控画面及录像回放将在此处展示
      </div>
    </div>
  );
}
