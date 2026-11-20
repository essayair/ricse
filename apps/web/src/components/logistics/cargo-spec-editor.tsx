'use client';
import { useEffect, useState } from 'react';
import { SPEC_LABELS, type CargoSpec } from '@ricse/shared-types/grade-price-spec';
import { api } from '@/lib/api';
import { alertAction, promptAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function CargoSpecEditor({ waybill, reload }: { waybill: { id: string; status: string; cargoSpec?: CargoSpec | null; cargoSpecOptions?: CargoSpec[] }; reload: () => Promise<void> }) {
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<CargoSpec | ''>(waybill.cargoSpec || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanManage(user.role === 'ADMIN' || user.permissions?.includes('logistics.manage')); } catch {}
  }, []);
  useEffect(() => setValue(waybill.cargoSpec || ''), [waybill.cargoSpec]);
  if (!waybill.cargoSpec && !waybill.cargoSpecOptions?.length) return null;
  const save = async () => {
    const reason = waybill.cargoSpec && value !== waybill.cargoSpec ? await promptAction('请填写货物规格更正原因', '', { title: '更正规格' }) : undefined;
    if (waybill.cargoSpec && value !== waybill.cargoSpec && !reason?.trim()) return;
    setBusy(true);
    try { await api.patch(`/waybills/${waybill.id}/cargo-spec`, { cargoSpec: value || null, reason }); await reload(); setEditing(false); }
    catch (e: any) { await alertAction(e.message || '保存失败', { title: '货物规格未保存' }); }
    finally { setBusy(false); }
  };
  return <Card className="space-y-3 p-5"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">本车货物规格</h2>{canManage && waybill.status !== 'CANCELLED' && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{waybill.cargoSpec ? '修改' : '补充'}</Button>}</div>
    {editing ? <div className="flex flex-wrap items-center gap-3"><select aria-label="本车货物规格" className="h-9 rounded-md border bg-background px-3 text-sm" value={value} onChange={e => setValue(e.target.value as CargoSpec | '')}><option value="">待确认</option>{waybill.cargoSpecOptions?.map(spec => <option key={spec} value={spec}>{SPEC_LABELS[spec]}</option>)}</select><Button size="sm" disabled={busy} onClick={() => void save()}>保存</Button><Button size="sm" variant="outline" onClick={() => { setValue(waybill.cargoSpec || ''); setEditing(false); }}>取消</Button></div> : <p className="text-sm">{waybill.cargoSpec ? SPEC_LABELS[waybill.cargoSpec] : '待确认'}</p>}
    <p className="text-xs text-muted-foreground">一车一种规格。分别计价时，结算按本车规格取价；已有结算或直拨交付确认后须先撤销相关单据才能更正。</p>
  </Card>;
}
