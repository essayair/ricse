'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';

const WAREHOUSE_TYPES = [
  { value: 'SELF', label: '自有仓库' },
  { value: 'RENT', label: '租赁仓库' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function WarehouseNewPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('SELF');
  const [partnerId, setPartnerId] = useState('');
  const [operators, setOperators] = useState<Array<{ id: string; partnerId: string; partner: { code: string; name: string } }>>([]);
  const [address, setAddress] = useState('');
  const [manager, setManager] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [remark, setRemark] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ items: Array<{ id: string; partnerId: string; partner: { code: string; name: string } }> }>('/service-organizations?type=WAREHOUSE_PORT&status=ACTIVE&pageSize=200')
      .then(result => setOperators(result.items || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!code) { setError('请填写仓库编码'); return; }
    if (!name) { setError('请填写仓库名称'); return; }
    if (type === 'RENT' && !partnerId) { setError('租赁仓库请选择已维护的仓储与港口服务商'); return; }

    setLoading(true);
    setError('');
    try {
      await api.post('/master-data/warehouses', {
        code, name, type,
        partnerId: partnerId || undefined,
        address: address || undefined,
        manager: manager || undefined,
        managerPhone: managerPhone || undefined,
        remark: remark || undefined,
      });
      router.push('/dashboard/master-data?tab=warehouses');
    } catch (e: unknown) {
      setError((e as Error).message || '创建失败');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">新增仓库</h1>
            <p className="text-sm text-muted-foreground mt-0.5">录入仓库基本信息，用于后续库存管理和物流调度</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存仓库'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-md border border-destructive/20">{error}</div>
      )}

      <div className="max-w-2xl">
        <Card className="p-6">
          <SectionTitle>基本信息</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="仓库编码" required>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如：WH-003" className="font-mono" />
            </FormField>
            <FormField label="仓库名称" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：金华前置仓" />
            </FormField>
            <FormField label="仓库类型" required>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {WAREHOUSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="仓管员">
              <Input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="仓管员姓名" />
            </FormField>
            <FormField label={type === 'RENT' ? '仓储与港口服务商' : '运营服务商（可选）'} required={type === 'RENT'}>
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择</option>
                {operators.map(item => <option key={item.id} value={item.partnerId}>{item.partner.code} · {item.partner.name}</option>)}
              </select>
            </FormField>
            <FormField label="联系电话">
              <Input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="仓管员电话" />
            </FormField>
            <FormField label="仓库地址">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="详细地址" />
            </FormField>
          </div>

          <SectionTitle>备注</SectionTitle>
          <textarea
            rows={2} value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="仓库说明（可选）"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </Card>

        <div className="flex justify-end gap-3 pb-8 border-t pt-6 mt-6">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading} size="lg">
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存仓库'}
          </Button>
        </div>
      </div>
    </div>
  );
}
