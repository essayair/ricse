'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Factory, Gem, MapPinned, Mountain, PanelsTopLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChinaProvinceMap, type ProvinceDistributionItem } from '@/components/industry-database/china-province-map';

const entries = [
  { key: 'fluorite', title: '萤石生产企业', description: '萤石开采、选矿和精粉生产企业', href: '/dashboard/industry-database/fluorite-producers', icon: Gem },
  { key: 'fluorochemical', title: '氟化工生产企业', description: '氢氟酸及氟化工下游生产企业', href: '/dashboard/industry-database/fluorochemical-producers', icon: Factory },
  { key: 'mines', title: '矿山与资源', description: '矿山、矿区和资源项目资料', href: '/dashboard/industry-database/mine-resources', icon: Mountain },
  { key: 'capacities', title: '产能与项目', description: '基地、装置、产品和产能项目', href: '/dashboard/industry-database/capacity-projects', icon: PanelsTopLeft },
  { key: 'parks', title: '产业园区', description: '氟化工产业园区和空间资料', href: '/dashboard/industry-database/parks', icon: MapPinned },
] as const;

type IndustrySummary = {
  counts: Record<string, number>;
  provinceDistribution: ProvinceDistributionItem[];
};

export default function IndustryDatabasePage() {
  const [summary, setSummary] = useState<IndustrySummary>({ counts: {}, provinceDistribution: [] });

  useEffect(() => {
    api.get<IndustrySummary>('/industry-database/summary').then(setSummary).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">产业数据库</h1>
        <p className="mt-1 text-sm text-muted-foreground">维护萤石—氟化工产业的静态企业、资源、产能和园区资料</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <Link key={entry.key} href={entry.href}>
              <Card className="h-full p-5 transition-colors hover:border-primary/50 hover:bg-muted/20">
                <div className="flex items-start justify-between">
                  <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
                  <span className="text-2xl font-semibold">{summary.counts?.[entry.key] || 0}</span>
                </div>
                <h2 className="mt-4 font-semibold">{entry.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">萤石生产企业区域分布</h2>
            <p className="mt-1 text-sm text-muted-foreground">按已录入企业所在省份统计；点击有数据的省份查看企业明细。</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/industry-database/fluorite-regional-map">查看大图<ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        {summary.provinceDistribution.length ? (
          <ChinaProvinceMap data={summary.provinceDistribution} compact />
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">录入萤石生产企业后，这里将按省份自动统计。</div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">产业数据库独立于合作伙伴、合同与财务主数据，当前以人工维护的静态资料为主。</p>
    </div>
  );
}
