'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Printer, Scale, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AttachmentPanel, BusinessAttachment } from '@/components/attachment-panel';
import { formatDateTimeToSecond, toLocalDateTimeInput } from '@/lib/date-time';

interface WeighRecord {
  id: string;
  weighingType: 'GROSS' | 'TARE';
  sequence: number;
  weight: string;
  dataSource: string;
  weighedAt: string;
  remarks: string | null;
  operator: { id: string; name: string };
}

interface WeighTicket {
  id: string;
  ticketNo: string;
  direction: string;
  status: string;
  dataSource: string;
  ticketDate: string;
  plateNo: string | null;
  materialName: string | null;
  materialSpec: string | null;
  shipperName: string | null;
  receiverName: string | null;
  packageCount: number | null;
  driverName: string | null;
  weighmasterName: string | null;
  printedAt: string | null;
  plannedQuantity: string;
  selectedGrossRecordId: string | null;
  selectedTareRecordId: string | null;
  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  shippingWeight: string | null;
  receivingWeight: string | null;
  customerWeight: string | null;
  thirdPartyWeight: string | null;
  manualWeight: string | null;
  settlementBasis: string;
  settlementWeight: string | null;
  varianceWeight: string | null;
  varianceRate: string | null;
  toleranceRate: string;
  abnormal: boolean;
  remarks: string | null;
  reviewRemark: string | null;
  reviewedAt: string | null;
  creator: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  records: WeighRecord[];
  attachments: BusinessAttachment[];
  waybill: {
    id: string;
    waybillNo: string;
    plateNo: string | null;
    driverName: string | null;
    totalQuantity: string;
    originLocation: string | null;
    destinationLocation: string | null;
    dispatchNotice: {
      noticeNo: string;
      type: string;
      order: {
        name: string;
        orderNo: string;
        contract: { contractNo: string; title: string };
      };
    };
  };
}

const STATUS: Record<string, string> = {
  PENDING: '待称重',
  WEIGHING: '称重中',
  COMPLETED: '待复核',
  REVIEWED: '已复核',
  VOIDED: '已作废',
};
const SOURCE: Record<string, string> = { DEVICE: '设备采集', MANUAL: '人工录入', IMPORTED: '导入' };
const BASIS: Array<[string, string]> = [
  ['RECEIVING', '本次称重净重（默认）'],
  ['SHIPPING', '发货重量'],
  ['CUSTOMER', '客户收货重量'],
  ['THIRD_PARTY', '第三方重量'],
  ['MANUAL', '手工确认重量'],
];
const BASIS_LABEL = Object.fromEntries(BASIS);

export default function WeighTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<WeighTicket | null>(null);
  const [recordType, setRecordType] = useState<'GROSS' | 'TARE'>('GROSS');
  const [recordWeight, setRecordWeight] = useState('');
  const [recordSource, setRecordSource] = useState('MANUAL');
  const [weighedAt, setWeighedAt] = useState('');
  const [recordRemarks, setRecordRemarks] = useState('');
  const [grossRecordId, setGrossRecordId] = useState('');
  const [tareRecordId, setTareRecordId] = useState('');
  const [basis, setBasis] = useState('RECEIVING');
  const [shippingWeight, setShippingWeight] = useState('');
  const [customerWeight, setCustomerWeight] = useState('');
  const [thirdPartyWeight, setThirdPartyWeight] = useState('');
  const [manualWeight, setManualWeight] = useState('');
  const [toleranceRate, setToleranceRate] = useState('0.5');
  const [reviewRemark, setReviewRemark] = useState('');
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ ticketDate: '', plateNo: '', materialName: '', materialSpec: '', shipperName: '', receiverName: '', packageCount: '0', driverName: '', weighmasterName: '', remarks: '' });
  const [saving, setSaving] = useState(false);

  const applyTicket = (data: WeighTicket) => {
    setTicket(data);
    setGrossRecordId(data.selectedGrossRecordId || '');
    setTareRecordId(data.selectedTareRecordId || '');
    setBasis(data.settlementBasis);
    setShippingWeight(data.shippingWeight || '');
    setCustomerWeight(data.customerWeight || '');
    setThirdPartyWeight(data.thirdPartyWeight || '');
    setManualWeight(data.manualWeight || '');
    setToleranceRate(data.toleranceRate || '0.5');
    setReviewRemark(data.reviewRemark || '');
    setInfoForm({
      ticketDate: data.ticketDate.slice(0, 10), plateNo: data.plateNo || data.waybill.plateNo || '',
      materialName: data.materialName || '', materialSpec: data.materialSpec || '',
      shipperName: data.shipperName || '', receiverName: data.receiverName || '',
      packageCount: String(data.packageCount ?? 0), driverName: data.driverName || data.waybill.driverName || '',
      weighmasterName: data.weighmasterName || data.creator.name, remarks: data.remarks || '',
    });
  };

  const load = async () => {
    try {
      applyTicket(await api.get<WeighTicket>(`/weigh-tickets/${id}`));
    } catch (error: any) {
      alert(error.message || '磅单加载失败');
      router.push('/dashboard/weighbridge');
    }
  };
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { setWeighedAt(toLocalDateTimeInput()); }, []);

  const addRecord = async () => {
    if (Number(recordWeight) <= 0) return alert('请输入有效的称重重量');
    setSaving(true);
    try {
      applyTicket(await api.post<WeighTicket>(`/weigh-tickets/${id}/records`, {
        weighingType: recordType,
        weight: Number(recordWeight),
        dataSource: recordSource,
        weighedAt: weighedAt || undefined,
        remarks: recordRemarks || undefined,
      }));
      setRecordWeight('');
      setRecordRemarks('');
      setWeighedAt(toLocalDateTimeInput());
    } catch (error: any) {
      alert(error.message || '称重记录保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveEffectiveRecords = async () => {
    if (!grossRecordId || !tareRecordId) return alert('请分别选择一条有效毛重和皮重记录');
    setSaving(true);
    try {
      applyTicket(await api.patch<WeighTicket>(`/weigh-tickets/${id}/effective-records`, { grossRecordId, tareRecordId }));
    } catch (error: any) {
      alert(error.message || '有效称重记录保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveSettlement = async () => {
    const values: Record<string, string> = { SHIPPING: shippingWeight, CUSTOMER: customerWeight, THIRD_PARTY: thirdPartyWeight, MANUAL: manualWeight };
    if (basis !== 'RECEIVING' && Number(values[basis]) <= 0) return alert('请填写所选结算口径的重量');
    setSaving(true);
    try {
      applyTicket(await api.patch<WeighTicket>(`/weigh-tickets/${id}/settlement`, {
        settlementBasis: basis,
        shippingWeight: shippingWeight ? Number(shippingWeight) : undefined,
        customerWeight: customerWeight ? Number(customerWeight) : undefined,
        thirdPartyWeight: thirdPartyWeight ? Number(thirdPartyWeight) : undefined,
        manualWeight: manualWeight ? Number(manualWeight) : undefined,
        toleranceRate: Number(toleranceRate) || 0.5,
      }));
    } catch (error: any) {
      alert(error.message || '结算口径保存失败');
    } finally {
      setSaving(false);
    }
  };

  const transition = async (status: string) => {
    const label = status === 'COMPLETED' ? '完成称重' : status === 'REVIEWED' ? '复核通过' : '作废';
    if (status === 'REVIEWED' && ticket?.abnormal && !reviewRemark.trim()) return alert('异常磅单复核必须填写处理意见');
    if (!confirm(`确定${label}当前磅单？`)) return;
    setSaving(true);
    try {
      applyTicket(await api.patch<WeighTicket>(`/weigh-tickets/${id}/status`, { status, reviewRemark: reviewRemark || undefined }));
    } catch (error: any) {
      alert(error.message || '状态更新失败');
    } finally {
      setSaving(false);
    }
  };

  const printTicket = async () => {
    try {
      applyTicket(await api.patch<WeighTicket>(`/weigh-tickets/${id}/print`, {}));
      window.setTimeout(() => window.print(), 100);
    } catch (error: any) {
      alert(error.message || '记录打印时间失败');
    }
  };

  const saveInfo = async () => {
    setSaving(true);
    try {
      applyTicket(await api.patch<WeighTicket>(`/weigh-tickets/${id}/info`, {
        ...infoForm, packageCount: Number(infoForm.packageCount),
      }));
      setEditingInfo(false);
    } catch (error: any) {
      alert(error.message || '磅单基本信息保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!ticket) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const editable = ['PENDING', 'WEIGHING'].includes(ticket.status);
  const settlementEditable = !['REVIEWED', 'VOIDED'].includes(ticket.status);
  const grossRecords = ticket.records.filter(item => item.weighingType === 'GROSS');
  const tareRecords = ticket.records.filter(item => item.weighingType === 'TARE');

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/weighbridge')}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{ticket.ticketNo}</h1><Badge variant={ticket.abnormal ? 'destructive' : 'default'}>{STATUS[ticket.status]}</Badge>{ticket.abnormal && <Badge variant="destructive">磅差异常</Badge>}</div>
          <p className="mt-1 text-sm text-muted-foreground">{ticket.direction === 'INBOUND' ? '采购入场' : '销售出场'} · {ticket.waybill.plateNo || '无车牌'}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={ticket.status === 'VOIDED'} onClick={() => void printTicket()}><Printer className="mr-2 h-4 w-4" />打印磅单</Button>
        {editable && <Button disabled={saving} onClick={() => void transition('COMPLETED')}><CheckCircle2 className="mr-2 h-4 w-4" />完成称重</Button>}
        {!['REVIEWED', 'VOIDED'].includes(ticket.status) && <Button variant="destructive" disabled={saving} onClick={() => void transition('VOIDED')}>作废</Button>}
      </div>
    </div>

    {ticket.abnormal && <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /><div><div className="font-medium text-destructive">称重净重与计划数量偏差超过 {number(ticket.toleranceRate)}%</div><div className="mt-1 text-muted-foreground">请核对称重记录和有效记录选择。磅单进入待复核后，请直接在下方醒目的异常复核区填写原因和处理意见。</div></div></div>}

    {ticket.status === 'COMPLETED' && <Card className={`space-y-4 border-2 p-5 ${ticket.abnormal ? 'border-destructive/50 bg-destructive/5' : 'border-primary/30 bg-primary/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">{ticket.abnormal ? <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />}<div><h2 className={`font-semibold ${ticket.abnormal ? 'text-destructive' : ''}`}>{ticket.abnormal ? '磅差异常复核' : '磅单复核'}</h2><p className="mt-1 text-sm text-muted-foreground">{ticket.abnormal ? `当前磅差 ${signedWeight(ticket.varianceWeight)}，偏差率 ${number(ticket.varianceRate)}%，超过容差 ${number(ticket.toleranceRate)}%。请说明异常原因及处理结果后再复核。` : '称重已完成，请核对数据；如有补充说明可填写后提交复核。'}</p></div></div>
        <Badge variant={ticket.abnormal ? 'destructive' : 'secondary'}>{ticket.abnormal ? '必须填写意见' : '待复核'}</Badge>
      </div>
      <div><label className="mb-2 block text-sm font-medium">复核意见{ticket.abnormal && <span className="ml-1 text-destructive">*</span>}</label><textarea autoFocus={ticket.abnormal} className={`min-h-28 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 ${ticket.abnormal ? 'border-destructive/50 focus:ring-destructive/20' : 'focus:ring-primary/20'}`} value={reviewRemark} onChange={event => setReviewRemark(event.target.value)} placeholder={ticket.abnormal ? '请填写偏差原因、核查过程和最终处理意见（必填）' : '可填写复核说明'} /><div className="mt-1 text-right text-xs text-muted-foreground">已输入 {reviewRemark.trim().length} 字</div></div>
      <div className="flex justify-end"><Button disabled={saving || (ticket.abnormal && !reviewRemark.trim())} onClick={() => void transition('REVIEWED')}><CheckCircle2 className="mr-2 h-4 w-4" />{saving ? '提交中...' : ticket.abnormal ? '填写意见并复核通过' : '复核通过'}</Button></div>
    </Card>}

    {ticket.status === 'REVIEWED' && <Card className={`p-5 ${ticket.abnormal ? 'border-destructive/30' : ''}`}><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">复核结果</h2><Badge variant="secondary">已复核</Badge></div><div className="grid gap-4 sm:grid-cols-3"><SmallField label="复核人" value={ticket.reviewer?.name || '-'} /><SmallField label="复核时间" value={formatDateTimeToSecond(ticket.reviewedAt)} /><SmallField label="处理意见" value={ticket.reviewRemark || '-'} /></div></Card>}

    <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">完整磅单信息</h2><p className="mt-1 text-xs text-muted-foreground">业务信息按创建时快照保存，称重时间取当前有效毛重和皮重记录</p></div><div className="flex items-center gap-2">{!['REVIEWED', 'VOIDED'].includes(ticket.status) && <Button variant="outline" size="sm" onClick={() => setEditingInfo(value => !value)}>{editingInfo ? '取消编辑' : '编辑基本信息'}</Button>}<Badge variant="outline">{ticket.ticketNo}</Badge></div></div><div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><SmallField label="磅单日期" value={formatDateOnly(ticket.ticketDate)} /><SmallField label="磅单编号" value={ticket.ticketNo} /><SmallField label="车牌号" value={ticket.plateNo || ticket.waybill.plateNo || '-'} /><SmallField label="货物名称" value={ticket.materialName || '-'} /><SmallField label="规格型号" value={ticket.materialSpec || '-'} /><SmallField label="包/袋数" value={ticket.packageCount === null ? '-' : `${ticket.packageCount}`} /><SmallField label="发货单位" value={ticket.shipperName || '-'} /><SmallField label="收货单位" value={ticket.receiverName || '-'} /><SmallField label="毛重（吨）" value={plainNumber(ticket.grossWeight)} /><SmallField label="皮重（吨）" value={plainNumber(ticket.tareWeight)} /><SmallField label="净重（吨）" value={plainNumber(ticket.netWeight)} /><SmallField label="毛重时间" value={recordTime(ticket.records, ticket.selectedGrossRecordId)} /><SmallField label="皮重时间" value={recordTime(ticket.records, ticket.selectedTareRecordId)} /><SmallField label="打印时间" value={formatDateTimeToSecond(ticket.printedAt, '尚未打印')} /><SmallField label="司机姓名" value={ticket.driverName || ticket.waybill.driverName || '-'} /><SmallField label="司磅员" value={ticket.weighmasterName || ticket.creator.name} /><div className="sm:col-span-2"><SmallField label="备注" value={ticket.remarks || '-'} /></div></div>{editingInfo && <div className="mt-5 space-y-4 border-t pt-5"><div className="grid gap-4 md:grid-cols-3"><InfoInput label="磅单日期" type="date" value={infoForm.ticketDate} setValue={value => setInfoForm(current => ({ ...current, ticketDate: value }))} /><InfoInput label="车牌号" value={infoForm.plateNo} setValue={value => setInfoForm(current => ({ ...current, plateNo: value }))} /><InfoInput label="司机姓名" value={infoForm.driverName} setValue={value => setInfoForm(current => ({ ...current, driverName: value }))} /><InfoInput label="货物名称" value={infoForm.materialName} setValue={value => setInfoForm(current => ({ ...current, materialName: value }))} /><InfoInput label="规格型号" value={infoForm.materialSpec} setValue={value => setInfoForm(current => ({ ...current, materialSpec: value }))} /><InfoInput label="包/袋数" type="number" value={infoForm.packageCount} setValue={value => setInfoForm(current => ({ ...current, packageCount: value }))} /><InfoInput label="发货单位" value={infoForm.shipperName} setValue={value => setInfoForm(current => ({ ...current, shipperName: value }))} /><InfoInput label="收货单位" value={infoForm.receiverName} setValue={value => setInfoForm(current => ({ ...current, receiverName: value }))} /><InfoInput label="司磅员" value={infoForm.weighmasterName} setValue={value => setInfoForm(current => ({ ...current, weighmasterName: value }))} /><div className="md:col-span-3"><InfoInput label="备注" value={infoForm.remarks} setValue={value => setInfoForm(current => ({ ...current, remarks: value }))} /></div></div><div className="flex justify-end"><Button disabled={saving} onClick={() => void saveInfo()}>{saving ? '保存中...' : '保存基本信息'}</Button></div></div>}</Card>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <Metric label="计划数量" value={weight(ticket.plannedQuantity)} />
      <Metric label="有效毛重" value={weight(ticket.grossWeight)} />
      <Metric label="有效皮重" value={weight(ticket.tareWeight)} />
      <Metric label="称重净重" value={weight(ticket.netWeight)} primary />
      <Metric label="磅差" value={signedWeight(ticket.varianceWeight)} danger={ticket.abnormal} />
      <Metric label="结算重量" value={weight(ticket.settlementWeight)} primary />
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">称重记录</h2><p className="mt-1 text-xs text-muted-foreground">基础流程为毛重、皮重各一次；支持追加多次复磅，历史记录不覆盖</p></div><Scale className="h-5 w-5 text-primary" /></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50"><tr><th className="px-3 py-2 text-left">有效</th><th className="px-3 py-2 text-left">序次</th><th className="px-3 py-2 text-left">类型</th><th className="px-3 py-2 text-right">重量</th><th className="px-3 py-2 text-left">来源</th><th className="px-3 py-2 text-left">称重时间</th><th className="px-3 py-2 text-left">操作人/备注</th></tr></thead>
              <tbody>{ticket.records.map(item => {
                const selected = item.weighingType === 'GROSS' ? grossRecordId === item.id : tareRecordId === item.id;
                return <tr key={item.id} className={`border-b ${selected ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-3"><input type="radio" name={item.weighingType} checked={selected} disabled={!editable} onChange={() => item.weighingType === 'GROSS' ? setGrossRecordId(item.id) : setTareRecordId(item.id)} /></td>
                  <td className="px-3 py-3 font-mono">#{item.sequence}</td><td className="px-3 py-3"><Badge variant="outline">{item.weighingType === 'GROSS' ? '毛重' : '皮重'}</Badge></td>
                  <td className="px-3 py-3 text-right font-medium">{weight(item.weight)}</td><td className="px-3 py-3">{SOURCE[item.dataSource] || item.dataSource}</td>
                  <td className="px-3 py-3">{formatDateTimeToSecond(item.weighedAt)}</td><td className="px-3 py-3"><div>{item.operator.name}</div><div className="text-xs text-muted-foreground">{item.remarks || '-'}</div></td>
                </tr>;
              })}</tbody>
            </table>
            {!ticket.records.length && <div className="py-10 text-center text-sm text-muted-foreground">暂无称重记录</div>}
          </div>
          {editable && ticket.records.length > 0 && <div className="mt-4 flex justify-end"><Button variant="outline" disabled={saving || !grossRecords.length || !tareRecords.length} onClick={() => void saveEffectiveRecords()}>保存有效毛重/皮重</Button></div>}
        </Card>

        {editable && <Card className="space-y-4 p-5">
          <div><h2 className="font-semibold">新增称重记录</h2><p className="mt-1 text-xs text-muted-foreground">新增同类型记录即为复磅，并自动作为该类型的最新有效记录，仍可在上方重新选择</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            <FieldSelect label="称重类型" value={recordType} onChange={value => setRecordType(value as 'GROSS' | 'TARE')} options={[['GROSS', '毛重'], ['TARE', '皮重']]} />
            <div><label className="mb-1 block text-sm">重量（吨）*</label><Input type="number" min="0" step="0.001" value={recordWeight} onChange={event => setRecordWeight(event.target.value)} /></div>
            <FieldSelect label="数据来源" value={recordSource} onChange={setRecordSource} options={[['MANUAL', '人工录入'], ['DEVICE', '设备采集'], ['IMPORTED', '导入']]} />
            <div><label className="mb-1 block text-sm">称重时间（精确到秒）</label><Input type="datetime-local" step="1" value={weighedAt} onChange={event => setWeighedAt(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">依次选择日期、小时、分钟和秒</p></div>
            <div className="md:col-span-2"><label className="mb-1 block text-sm">备注</label><Input value={recordRemarks} onChange={event => setRecordRemarks(event.target.value)} placeholder="复磅原因、设备编号等" /></div>
          </div>
          <div className="flex justify-end"><Button disabled={saving || Number(recordWeight) <= 0} onClick={() => void addRecord()}>{saving ? '保存中...' : '保存称重记录'}</Button></div>
        </Card>}
        <AttachmentPanel
          title="磅单附件"
          description="现场磅单照片、设备导出磅单或扫描件；完成称重前至少需要一份"
          attachments={ticket.attachments}
          uploadPath={`/weigh-tickets/${ticket.id}/attachments`}
          attachmentPath="/weigh-tickets/attachments"
          canUpload={!['REVIEWED', 'VOIDED'].includes(ticket.status)}
          canDelete={['PENDING', 'WEIGHING'].includes(ticket.status)}
          onChanged={load}
        />
      </div>

      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div><h2 className="font-semibold">结算重量口径</h2><p className="mt-1 text-xs text-muted-foreground">默认按本次称重净重结算，也可改用其他确认重量</p></div>
          <FieldSelect label="当前口径" value={basis} disabled={!settlementEditable} onChange={setBasis} options={BASIS} />
          {basis === 'RECEIVING' && <div className="rounded-md bg-muted p-3 text-sm">本次称重净重：<strong>{weight(ticket.netWeight)}</strong><div className="mt-1 text-xs text-muted-foreground">由当前有效毛重与皮重自动计算</div></div>}
          {basis === 'SHIPPING' && <WeightInput label="发货重量（吨）" value={shippingWeight} setValue={setShippingWeight} disabled={!settlementEditable} />}
          {basis === 'CUSTOMER' && <WeightInput label="客户收货重量（吨）" value={customerWeight} setValue={setCustomerWeight} disabled={!settlementEditable} />}
          {basis === 'THIRD_PARTY' && <WeightInput label="第三方重量（吨）" value={thirdPartyWeight} setValue={setThirdPartyWeight} disabled={!settlementEditable} />}
          {basis === 'MANUAL' && <WeightInput label="手工确认重量（吨）" value={manualWeight} setValue={setManualWeight} disabled={!settlementEditable} />}
          <WeightInput label="磅差容差（%）" value={toleranceRate} setValue={setToleranceRate} disabled={!settlementEditable} step="0.01" />
          {settlementEditable && <Button className="w-full" variant="outline" disabled={saving} onClick={() => void saveSettlement()}>保存结算口径</Button>}
          <div className="border-t pt-3 text-sm"><div className="text-muted-foreground">当前结算重量</div><div className="mt-1 text-xl font-semibold text-primary">{weight(ticket.settlementWeight)}</div><div className="mt-1 text-xs text-muted-foreground">{BASIS_LABEL[ticket.settlementBasis]}</div></div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /><h2 className="font-semibold">关联业务</h2></div>
          <button className="w-full rounded-md border p-3 text-left hover:bg-muted" onClick={() => router.push(`/dashboard/waybills/${ticket.waybill.id}`)}><div className="font-medium">{ticket.waybill.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{ticket.waybill.plateNo || '无车牌'} · {ticket.waybill.driverName || '无司机'} · {number(ticket.waybill.totalQuantity)} 吨</div></button>
          <div><div className="text-sm font-medium">{ticket.waybill.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-primary">{ticket.waybill.dispatchNotice.order.orderNo}</div><div className="mt-1 text-xs text-muted-foreground">{ticket.waybill.dispatchNotice.order.contract.contractNo} · {ticket.waybill.dispatchNotice.order.contract.title}</div></div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3"><SmallField label="起运地" value={ticket.waybill.originLocation || '-'} /><SmallField label="目的地" value={ticket.waybill.destinationLocation || '-'} /><SmallField label="建单人" value={ticket.creator.name} /><SmallField label="建单备注" value={ticket.remarks || '-'} /></div>
        </Card>

      </div>
    </div>
  </div>;
}

function Metric({ label, value, primary, danger }: { label: string; value: string; primary?: boolean; danger?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-2 text-lg font-semibold ${danger ? 'text-destructive' : primary ? 'text-primary' : ''}`}>{value}</div></Card>;
}
function FieldSelect({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) {
  return <div><label className="mb-1 block text-sm">{label}</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>;
}
function WeightInput({ label, value, setValue, disabled, step = '0.001' }: { label: string; value: string; setValue: (value: string) => void; disabled?: boolean; step?: string }) {
  return <div><label className="mb-1 block text-sm">{label}</label><Input type="number" min="0" step={step} value={value} disabled={disabled} onChange={event => setValue(event.target.value)} /></div>;
}
function SmallField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>;
}
function InfoInput({ label, value, setValue, type = 'text' }: { label: string; value: string; setValue: (value: string) => void; type?: string }) {
  return <div><label className="mb-1 block text-sm font-medium">{label} *</label><Input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} value={value} onChange={event => setValue(event.target.value)} /></div>;
}
function number(value: string | number | null) {
  return value === null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}
function weight(value: string | null) {
  return value === null ? '-' : `${number(value)} 吨`;
}
function signedWeight(value: string | null) {
  if (value === null) return '-';
  const result = Number(value);
  return `${result > 0 ? '+' : ''}${number(result)} 吨`;
}
function plainNumber(value: string | null) {
  return value === null ? '-' : number(value);
}
function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}
function recordTime(records: WeighRecord[], id: string | null) {
  const record = records.find(item => item.id === id);
  return formatDateTimeToSecond(record?.weighedAt);
}
