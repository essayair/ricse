'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, MapPin, Pencil, Truck, Weight } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface VehicleDetail {
  id: string; plateNo: string; vehicleType: string; brand: string | null; tareWeight: string | null; loadCapacity: string;
  plateColor: string | null; licenseNo: string | null; annualInspectionExpiry: string | null;
  compulsoryInsuranceExpiry: string | null; commercialInsuranceExpiry: string | null;
  ownerType: string; ownerName: string | null; ownerPhone: string | null; status: string; remark: string | null;
  deviceType: string | null; deviceNo: string | null; deviceInstalledAt: string | null;
  owner: { id: string; code: string; name: string; isInternal: boolean } | null;
  drivers: Array<{ id: string; role: string; driver: { id: string; name: string; phone: string; idCardNo: string | null; licenseNo: string | null; licenseClass: string | null; licenseExpiry: string | null; status: string; serviceOrganization: { partner: { name: string } } } }>;
  waybills: Array<{ id: string; waybillNo: string; status: string; totalQuantity: string; driverName: string | null; driverPhone: string | null; originLocation: string | null; destinationLocation: string | null; createdAt: string; departedAt: string | null; arrivedAt: string | null; dispatchNotice: { noticeNo: string; order: { orderNo: string; name: string; contract: { id: string; contractNo: string; title: string } } }; weighTickets: Array<{ id: string; ticketNo: string; ticketDate: string; grossWeight: string | null; tareWeight: string | null; netWeight: string | null; status: string }> }>;
  _count: { waybills: number };
}

const VEHICLE_TYPES: Record<string, string> = { SEMI_TRAILER: '半挂车（标准型）', HEAVY_SEMI_TRAILER: '半挂车（超重型）', BOX_TRUCK: '厢式货车', DUMP_TRUCK: '自卸车', TANK_TRUCK: '槽罐车', TRUCK: '自卸车', TANK: '罐车', TRAILER: '挂车' };
const STATUS: Record<string, string> = { ACTIVE: '可用', MAINTENANCE: '维修中', RETIRED: '已退役' };
const WAYBILL_STATUS: Record<string, string> = { PENDING: '待发运', IN_TRANSIT: '在途', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已取消' };
const PLATE_COLOR: Record<string, string> = { YELLOW: '黄牌', GREEN: '绿牌（新能源）', BLUE: '蓝牌', BLACK: '黑牌（港澳）', OTHER: '其他' };

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [tab, setTab] = useState<'PROFILE' | 'TRACK' | 'WEIGH' | 'TRANSPORT'>('PROFILE');
  const load = () => api.get<VehicleDetail>(`/partners/vehicles/${id}`).then(setVehicle).catch((error) => { alert(error.message || '车辆加载失败'); router.push('/dashboard/master-data?tab=vehicles'); });
  useEffect(() => { void load(); }, [id]);
  const weighTickets = useMemo(() => vehicle?.waybills.flatMap(waybill => waybill.weighTickets.map(ticket => ({ ...ticket, waybill }))) || [], [vehicle]);
  const totalQuantity = useMemo(() => vehicle?.waybills.filter(item => item.status !== 'CANCELLED').reduce((sum, item) => sum + Number(item.totalQuantity), 0) || 0, [vehicle]);
  const toggleStatus = async () => {
    if (!vehicle || vehicle.status === 'RETIRED') return;
    const status = vehicle.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE';
    try { await api.patch(`/partners/vehicles/${id}`, { status }); await load(); }
    catch (error: any) { alert(error.message || '状态更新失败'); }
  };
  if (!vehicle) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/master-data?tab=vehicles')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{vehicle.plateNo}</h1><Badge variant={vehicle.status === 'ACTIVE' ? 'default' : 'secondary'}>{STATUS[vehicle.status] || vehicle.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{VEHICLE_TYPES[vehicle.vehicleType] || vehicle.vehicleType} · {vehicle.owner?.name || (vehicle.ownerType === 'SELF' ? '自有车辆' : '未设置承运商')}</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => router.push(`/dashboard/master-data/vehicles/${id}/edit`)}><Pencil className="mr-1 h-4 w-4" />编辑</Button>{vehicle.status !== 'RETIRED' && <Button variant="outline" onClick={() => void toggleStatus()}>{vehicle.status === 'ACTIVE' ? '转维修停用' : '恢复可用'}</Button>}</div></div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="历史运单" value={`${vehicle._count.waybills} 单`} icon={FileText} /><Stat label="累计运输数量" value={`${number(totalQuantity)} 吨`} icon={Truck} /><Stat label="历史磅单" value={`${weighTickets.length} 张`} icon={Weight} /><Stat label="定位设备" value={vehicle.deviceType && vehicle.deviceType !== 'NONE' ? `${deviceLabel(vehicle.deviceType)}已绑定` : '未绑定'} icon={MapPin} /></div>

    <div className="flex overflow-x-auto border-b">{([['PROFILE', '车辆档案'], ['TRACK', 'GPS轨迹'], ['WEIGH', '历史磅单'], ['TRANSPORT', '运输统计']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`border-b-2 px-5 py-2.5 text-sm ${tab === value ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>)}</div>

    {tab === 'PROFILE' && <div className="space-y-5"><Card className="space-y-5 p-6"><Title>车辆基本信息</Title><Grid><Info label="车牌号码" value={vehicle.plateNo} /><Info label="车辆类型" value={VEHICLE_TYPES[vehicle.vehicleType] || vehicle.vehicleType} /><Info label="品牌型号" value={vehicle.brand || '—'} /><Info label="档案状态" value={STATUS[vehicle.status] || vehicle.status} /><Info label="整备质量（皮重）" value={vehicle.tareWeight ? `${number(vehicle.tareWeight)} 吨` : '—'} /><Info label="核定载重" value={`${number(vehicle.loadCapacity)} 吨`} /><Info label="车牌颜色" value={PLATE_COLOR[vehicle.plateColor || ''] || '—'} /></Grid><Title>证件与保险</Title><Grid><Info label="行驶证号" value={vehicle.licenseNo || '—'} /><Expiry label="年检到期日" value={vehicle.annualInspectionExpiry} /><Expiry label="交强险到期日" value={vehicle.compulsoryInsuranceExpiry} /><Expiry label="商业险到期日" value={vehicle.commercialInsuranceExpiry} /></Grid></Card>
      <Card className="space-y-5 p-6"><Title>承运商 / 车主</Title><Grid><Info label="归属类型" value={vehicle.ownerType === 'SELF' ? '自有车辆' : '外协车辆'} /><Info label="所属单位" value={vehicle.owner ? `${vehicle.owner.code} · ${vehicle.owner.name}` : '—'} /><Info label="实际车主" value={vehicle.ownerName || '—'} /><Info label="车主手机号" value={vehicle.ownerPhone || '—'} /></Grid><Title>关联司机</Title>{vehicle.drivers.length ? <div className="grid gap-3 md:grid-cols-2">{vehicle.drivers.map(link => <div key={link.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div className="font-medium">{link.driver.name}</div><Badge variant="outline">{link.role === 'PRIMARY' ? '主驾' : '副驾'}</Badge></div><div className="mt-2 text-sm text-muted-foreground">{link.driver.phone} · {link.driver.licenseClass || '未填写准驾车型'}</div><div className="mt-1 text-xs text-muted-foreground">{link.driver.serviceOrganization.partner.name}</div></div>)}</div> : <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">尚未关联司机，运单调度时仍可从承运商司机档案选择。</div>}</Card>
      <Card className="space-y-5 p-6"><Title>定位设备</Title><Grid><Info label="设备类型" value={deviceLabel(vehicle.deviceType)} /><Info label="设备编号" value={vehicle.deviceNo || '—'} /><Info label="安装日期" value={dateOnly(vehicle.deviceInstalledAt)} /><Info label="实时状态" value="尚未接入定位平台" /></Grid><Title>备注</Title><div className="text-sm">{vehicle.remark || '—'}</div></Card></div>}

    {tab === 'TRACK' && <Card className="p-8 text-center"><MapPin className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-3 font-semibold">{vehicle.deviceType && vehicle.deviceType !== 'NONE' ? '定位设备档案已维护' : '车辆尚未绑定定位设备'}</h2><p className="mt-2 text-sm text-muted-foreground">GPS轨迹、围栏与最后位置将在真实北斗/GPS平台接入后展示，当前不生成模拟轨迹。</p></Card>}

    {tab === 'WEIGH' && <Card className="overflow-hidden">{!weighTickets.length ? <Empty text="暂无关联磅单" /> : <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">磅单号</th><th className="p-3">日期</th><th className="p-3">毛重</th><th className="p-3">皮重</th><th className="p-3">净重</th><th className="p-3">物流运单</th><th className="p-3">状态</th></tr></thead><tbody>{weighTickets.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/weighbridge/${item.id}`)}><td className="p-3 font-mono text-primary">{item.ticketNo}</td><td className="p-3">{dateOnly(item.ticketDate)}</td><td className="p-3">{weight(item.grossWeight)}</td><td className="p-3">{weight(item.tareWeight)}</td><td className="p-3 font-medium">{weight(item.netWeight)}</td><td className="p-3 font-mono text-xs">{item.waybill.waybillNo}</td><td className="p-3">{item.status}</td></tr>)}</tbody></table></div>}</Card>}

    {tab === 'TRANSPORT' && <Card className="overflow-hidden">{!vehicle.waybills.length ? <Empty text="暂无运输记录" /> : <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">物流运单</th><th className="p-3">合同 / 执行批次</th><th className="p-3">实际司机</th><th className="p-3">运输路线</th><th className="p-3 text-right">数量</th><th className="p-3">发运 / 到达</th><th className="p-3">状态</th></tr></thead><tbody>{vehicle.waybills.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/waybills/${item.id}`)}><td className="p-3 font-mono text-primary">{item.waybillNo}</td><td className="p-3"><div>{item.dispatchNotice.order.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.dispatchNotice.order.contract.contractNo}</div></td><td className="p-3"><div>{item.driverName || '—'}</div><div className="text-xs text-muted-foreground">{item.driverPhone || '—'}</div></td><td className="p-3 text-xs">{item.originLocation || '—'} → {item.destinationLocation || '—'}</td><td className="p-3 text-right">{number(item.totalQuantity)} 吨</td><td className="p-3 text-xs"><div>{dateTime(item.departedAt)}</div><div className="mt-1 text-muted-foreground">{dateTime(item.arrivedAt)}</div></td><td className="p-3"><Badge variant="secondary">{WAYBILL_STATUS[item.status] || item.status}</Badge></td></tr>)}</tbody></table></div>}</Card>}
  </div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) { return <Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div></Card>; }
function Title({ children }: { children: React.ReactNode }) { return <h2 className="border-b pb-2 font-semibold">{children}</h2>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>; }
function Expiry({ label, value }: { label: string; value: string | null }) { const days = value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null; return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-sm ${days !== null && days <= 30 ? 'text-amber-700' : ''}`}>{dateOnly(value)}{days !== null && days >= 0 && days <= 30 ? `（${days}天后到期）` : days !== null && days < 0 ? '（已到期）' : ''}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-muted-foreground">{text}</div>; }
function number(value: string | number) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 }); }
function weight(value: string | null) { return value == null ? '—' : `${number(value)} 吨`; }
function dateOnly(value: string | null) { return value ? new Date(value).toLocaleDateString('zh-CN') : '—'; }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN') : '—'; }
function deviceLabel(value: string | null) { return ({ BEIDOU: '北斗 OBD 终端', GPS: 'GPS 移动设备', NONE: '未绑定' } as Record<string, string>)[value || 'NONE'] || '未绑定'; }
