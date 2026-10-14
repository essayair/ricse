'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, MapPinned } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { ChinaProvinceMap, type ProvinceDistributionItem } from '@/components/industry-database/china-province-map';

type IndustrySummary = { provinceDistribution: ProvinceDistributionItem[] };

export default function FluoriteRegionalMapPage() {
  const [summary, setSummary] = useState<IndustrySummary | null>(null);

  useEffect(() => {
    api.get<IndustrySummary>('/industry-database/summary').then(setSummary).catch(() => setSummary({ provinceDistribution: [] }));
  }, []);

  const distribution = [...(summary?.provinceDistribution || [])].sort((left, right) => right.count - left.count);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary"><MapPinned className="h-5 w-5" /><span className="text-sm font-medium">产业空间分布</span></div>
        <h1 className="mt-2 text-2xl font-bold">萤石生产企业区域分布</h1>
        <p className="mt-1 text-sm text-muted-foreground">按产业数据库中已录入企业的所在省份统计，点击地图省份或右侧排名进入企业列表。</p>
      </div>

      {!summary ? (
        <Card className="flex min-h-[520px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />区域数据加载中</Card>
      ) : distribution.length ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <ChinaProvinceMap data={distribution} />
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">省份企业数量</h2>
              <p className="mt-1 text-xs text-muted-foreground">共 {distribution.reduce((total, item) => total + item.count, 0)} 家已录入企业</p>
            </div>
            <div className="max-h-[620px] divide-y overflow-y-auto">
              {distribution.map((item, index) => (
                <Link
                  key={item.province}
                  href={`/dashboard/industry-database/fluorite-producers?province=${encodeURIComponent(item.province)}`}
                  className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${index < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{index + 1}</span>
                  <span className="flex-1 font-medium">{item.province}</span>
                  <span className="text-muted-foreground">{item.count} 家</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">暂无可展示的省份数据</Card>
      )}

      <p className="text-xs text-muted-foreground">统计口径：萤石生产企业主数据中的省份字段。地图仅用于区域分布展示，不代表精确厂址或矿区边界。</p>
    </div>
  );
}
