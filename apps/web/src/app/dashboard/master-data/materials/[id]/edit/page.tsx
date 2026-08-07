'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CopyPlus, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const REFERENCE_LABELS: Record<string, string> = {
  TRADING_GOODS: '贸易商品（TRD）', RAW_MATERIAL: '原材料（RAW）', SEMI_FINISHED: '半成品（SFG）',
  FINISHED_GOODS: '产成品（FGD）', AUXILIARY: '辅助材料（AUX）', PACKAGING: '包装材料（PKG）',
  SERVICE: '服务项目（SRV）', OTHER: '其他物料（OTH）',
};

interface MaterialDetail {
  id: string; code: string; name: string; referenceType: string; commodityForm: string | null;
  grade: string | null; unit: string; packageType: string | null; status: string;
  hsCode: string | null; taxCode: string | null; internalCode: string | null;
  qcTemplate: string | null; isVirtual: boolean; remark: string | null;
  category: { id: string; name: string };
  standardCommodity: null | {
    code: string; name: string; baseName: string; commodityForm: string;
    coreSpecName: string; coreSpecOperator: string; coreSpecValue: string;
    coreSpecUnit: string; packageType: string; unit: string;
  };
}

export default function MaterialEditPage() {
  const router = useRouter();
  const id = useParams().id as string;
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [status, setStatus] = useState('ACTIVE');
  const [qcTemplate, setQcTemplate] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [isVirtual, setIsVirtual] = useState(false);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<MaterialDetail>(`/master-data/materials/${id}`).then((data) => {
      setMaterial(data); setStatus(data.status); setQcTemplate(data.qcTemplate || '');
      setInternalCode(data.internalCode || ''); setHsCode(data.hsCode || '');
      setTaxCode(data.taxCode || ''); setIsVirtual(data.isVirtual); setRemark(data.remark || '');
    }).catch(() => setError('物料信息加载失败'));
  }, [id]);

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      await api.patch(`/master-data/materials/${id}`, {
        status, qcTemplate: qcTemplate.trim() || null, internalCode: internalCode.trim() || null,
        hsCode: hsCode.trim() || null, taxCode: taxCode.trim() || null,
        isVirtual, remark: remark.trim() || null,
      });
      router.push('/dashboard/master-data?tab=materials');
    } catch (exception) {
      setError((exception as Error).message || '保存失败'); setLoading(false);
    }
  };

  const standard = material?.standardCommodity;
  const coreSpec = standard
    ? `${standard.coreSpecName}${standard.coreSpecOperator}${standard.coreSpecValue}${standard.coreSpecUnit}`
    : material?.grade || '-';

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
        <div><h1 className="text-2xl font-bold">维护商品物料</h1><p className="mt-1 text-sm text-muted-foreground">物料身份信息创建后锁定，可继续维护管理属性</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!material} onClick={() => router.push(`/dashboard/master-data/materials/new?from=${id}&referenceType=FINISHED_GOODS`)}><CopyPlus className="mr-1 h-4 w-4" />基于此物料创建产成品</Button>
        <Button disabled={loading || !material} onClick={() => void handleSubmit()}><Save className="mr-1 h-4 w-4" />{loading ? '保存中...' : '保存'}</Button>
      </div>
    </div>
    {error && <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    {!material ? <Card className="p-8 text-center text-sm text-muted-foreground">{error || '正在加载...'}</Card> : <div className="max-w-4xl space-y-4">
      <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">物料身份</h2><p className="mt-1 text-xs text-muted-foreground">以下字段决定合同、库存、质检与结算中“这是什么商品”，如需改变请新建物料</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          <ReadOnly label="业务物料编码" value={material.code} mono />
          <ReadOnly label="平台标准编码" value={standard?.code || '历史数据'} mono />
          <ReadOnly label="参考类型" value={REFERENCE_LABELS[material.referenceType] || material.referenceType} />
          <ReadOnly label="商品名称（系统拼接）" value={standard?.name || material.name} className="md:col-span-2" />
          <ReadOnly label="商品分类" value={material.category?.name || '-'} />
          <ReadOnly label="商品品名" value={standard?.baseName || material.name} />
          <ReadOnly label="商品形态" value={standard?.commodityForm || material.commodityForm || '-'} />
          <ReadOnly label="核心规格" value={coreSpec} />
          <ReadOnly label="包装方式" value={standard?.packageType || material.packageType || '-'} />
          <ReadOnly label="计量单位" value={unitLabel(standard?.unit || material.unit)} />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">管理属性</h2><p className="mt-1 text-xs text-muted-foreground">这些字段不改变物料身份，可按业务需要维护</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="状态"><select value={status} onChange={event => setStatus(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></Field>
          <Field label="质检模板"><Input value={qcTemplate} onChange={event => setQcTemplate(event.target.value)} placeholder="可选" /></Field>
          <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={isVirtual} onChange={event => setIsVirtual(event.target.checked)} />不参与实物库存</label>
          <Field label="内部编码"><Input value={internalCode} onChange={event => setInternalCode(event.target.value)} className="font-mono" /></Field>
          <Field label="HS 编码"><Input value={hsCode} onChange={event => setHsCode(event.target.value)} className="font-mono" /></Field>
          <Field label="税务商品编码"><Input value={taxCode} onChange={event => setTaxCode(event.target.value)} className="font-mono" /></Field>
        </div>
        <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={remark} onChange={event => setRemark(event.target.value)} /></Field>
      </Card>
    </div>}
  </div>;
}

function ReadOnly({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return <div className={className}><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm ${mono ? 'font-mono' : ''}`}>{value || '-'}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block text-sm font-medium">{label}</label>{children}</div>;
}
