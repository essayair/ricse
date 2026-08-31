'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const REFERENCE_LABELS: Record<string, string> = {
  TRADING_GOODS: '贸易商品（TRD）', RAW_MATERIAL: '原材料（RAW）', SEMI_FINISHED: '半成品（SFG）',
  FINISHED_GOODS: '产成品（FGD）', AUXILIARY: '辅助材料（AUX）', PACKAGING: '包装材料（PKG）',
  SERVICE: '服务项目（SRV）', OTHER: '其他物料（OTH）',
};

interface SpecItem {
  name?: string; operator?: string; value?: string; unit?: string;
}

interface MaterialDetail {
  id: string; code: string; name: string; referenceType: string; commodityForm: string | null;
  grade: string | null; unit: string; packageType: string | null; status: string;
  specs: SpecItem[] | null; spec: string | null; sourceRegion: string | null;
  hsCode: string | null; taxCode: string | null; internalCode: string | null;
  qcTemplate: string | null; qualityTemplateId: string | null; qualityTemplate?: { id: string; code: string; name: string; version: number } | null; isVirtual: boolean; remark: string | null;
  createdAt: string; updatedAt: string;
  category: { id: string; name: string };
  standardCommodity: null | {
    code: string; name: string; baseName: string; commodityForm: string;
    coreSpecName: string; coreSpecOperator: string; coreSpecValue: string;
    coreSpecUnit: string; packageType: string; unit: string;
  };
}

export default function MaterialDetailPage() {
  const router = useRouter();
  const id = useParams().id as string;
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<MaterialDetail>(`/master-data/materials/${id}`).then(setMaterial).catch((exception) => {
      setError((exception as Error).message || '商品物料加载失败');
    });
  }, [id]);

  const specificationItems = useMemo(() => {
    if (!material) return [];
    if (Array.isArray(material.specs) && material.specs.length > 0) return material.specs;
    const standard = material.standardCommodity;
    if (!standard?.coreSpecName) return [];
    return [{
      name: standard.coreSpecName, operator: standard.coreSpecOperator,
      value: standard.coreSpecValue, unit: standard.coreSpecUnit,
    }];
  }, [material]);

  if (!material) return <div className="space-y-6">
    <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
    <Card className="p-8 text-center text-sm text-muted-foreground">{error || '正在加载商品物料...'}</Card>
  </div>;

  const standard = material.standardCommodity;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
        <div><h1 className="text-2xl font-bold">{material.name}</h1><p className="mt-1 text-sm text-muted-foreground">商品物料详情 · {material.code}</p></div>
      </div>
      <Link href={`/dashboard/master-data/materials/${id}/edit`}><Button><Pencil className="mr-1 h-4 w-4" />编辑管理属性</Button></Link>
    </div>
    {error && <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="space-y-4">
        <Card className="space-y-5 p-6">
          <div className="flex items-center justify-between"><h2 className="font-semibold">商品基本信息</h2><Badge variant={material.status === 'ACTIVE' ? 'default' : 'secondary'}>{material.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div>
          <div className="grid gap-4 md:grid-cols-3">
            <Info label="商品名称" value={material.name} className="md:col-span-2" />
            <Info label="商品分类" value={material.category?.name} />
            <Info label="物料编码" value={material.code} mono />
            <Info label="平台标准编码" value={standard?.code || '历史数据'} mono />
            <Info label="参考类型" value={REFERENCE_LABELS[material.referenceType] || material.referenceType} />
            <Info label="商品形态" value={standard?.commodityForm || material.commodityForm} />
            <Info label="包装方式" value={standard?.packageType || material.packageType} />
            <Info label="计量单位" value={unitLabel(standard?.unit || material.unit)} />
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div><h2 className="font-semibold">规格标准定义</h2><p className="mt-1 text-xs text-muted-foreground">第一项为参与商品名称与查重的核心规格</p></div>
          {specificationItems.length === 0 ? <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">暂无规格指标</div> : <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[560px] text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">类型</th><th className="px-4 py-3">指标名称</th><th className="px-4 py-3">比较符</th><th className="px-4 py-3">指标值</th><th className="px-4 py-3">单位</th></tr></thead>
              <tbody>{specificationItems.map((item, index) => <tr key={`${item.name}-${index}`} className="border-t"><td className="px-4 py-3">{index === 0 ? <Badge variant="outline">核心规格</Badge> : '其他指标'}</td><td className="px-4 py-3 font-medium">{item.name || '-'}</td><td className="px-4 py-3">{item.operator || '-'}</td><td className="px-4 py-3">{item.value || '-'}</td><td className="px-4 py-3">{item.unit || '-'}</td></tr>)}</tbody>
            </table>
          </div>}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-4 p-6"><h2 className="font-semibold">管理属性</h2>
          <Info label="质检模板" value={material.qualityTemplate ? `${material.qualityTemplate.code} · ${material.qualityTemplate.name}（v${material.qualityTemplate.version}）` : material.qcTemplate} />
          <Info label="是否参与实物库存" value={material.isVirtual ? '否' : '是'} />
          <Info label="内部编码" value={material.internalCode} mono />
          <Info label="HS 编码" value={material.hsCode} mono />
          <Info label="税务商品编码" value={material.taxCode} mono />
        </Card>
        <Card className="space-y-4 p-6"><h2 className="font-semibold">其他信息</h2>
          <Info label="备注" value={material.remark} />
          <Info label="创建时间" value={formatDate(material.createdAt)} />
          <Info label="最后更新" value={formatDate(material.updatedAt)} />
        </Card>
      </div>
    </div>
  </div>;
}

function Info({ label, value, mono, className }: { label: string; value?: string | null; mono?: boolean; className?: string }) {
  return <div className={className}><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 break-words text-sm ${mono ? 'font-mono' : ''}`}>{value || '-'}</div></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false });
}
