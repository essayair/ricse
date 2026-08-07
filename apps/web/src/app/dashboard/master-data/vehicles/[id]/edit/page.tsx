'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { VehicleForm, VehicleFormValue } from '@/components/vehicle-form';

interface VehicleDetail {
  plateNo: string; vehicleType: string; brand: string | null; loadCapacity: string;
  tareWeight: string | null; plateColor: string | null; licenseNo: string | null;
  annualInspectionExpiry: string | null; compulsoryInsuranceExpiry: string | null; commercialInsuranceExpiry: string | null;
  ownerType: string; ownerId: string | null; ownerName: string | null; ownerPhone: string | null;
  drivers: Array<{ driverId: string; role: 'PRIMARY' | 'SECONDARY' }>;
  deviceType: string | null; deviceNo: string | null; deviceInstalledAt: string | null;
  status: string; remark: string | null; _count: { waybills: number };
}

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const back = () => router.push(`/dashboard/master-data/vehicles/${id}`);
  useEffect(() => {
    api.get<VehicleDetail>(`/partners/vehicles/${id}`).then(setVehicle).catch((error) => { alert(error.message || '车辆加载失败'); router.push('/dashboard/master-data?tab=vehicles'); });
  }, [id]);

  const update = async (value: VehicleFormValue) => {
    try {
      await api.patch(`/partners/vehicles/${id}`, {
        ...value,
        loadCapacity: Number(value.loadCapacity),
        tareWeight: value.tareWeight ? Number(value.tareWeight) : null,
        ownerId: value.ownerId || null,
        brand: value.brand.trim() || null,
        licenseNo: value.licenseNo.trim() || null,
        annualInspectionExpiry: value.annualInspectionExpiry || null,
        compulsoryInsuranceExpiry: value.compulsoryInsuranceExpiry || null,
        commercialInsuranceExpiry: value.commercialInsuranceExpiry || null,
        ownerName: value.ownerName.trim() || null,
        ownerPhone: value.ownerPhone || null,
        deviceNo: value.deviceNo.trim() || null,
        deviceInstalledAt: value.deviceInstalledAt || null,
        remark: value.remark.trim() || null,
      });
      back();
    } catch (error: any) {
      alert(error.message || '车辆保存失败');
      throw error;
    }
  };

  if (!vehicle) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const initialValue: VehicleFormValue = {
    plateNo: vehicle.plateNo,
    vehicleType: vehicle.vehicleType,
    brand: vehicle.brand || '',
    tareWeight: vehicle.tareWeight || '',
    loadCapacity: vehicle.loadCapacity,
    plateColor: vehicle.plateColor || 'YELLOW',
    licenseNo: vehicle.licenseNo || '',
    annualInspectionExpiry: vehicle.annualInspectionExpiry?.slice(0, 10) || '',
    compulsoryInsuranceExpiry: vehicle.compulsoryInsuranceExpiry?.slice(0, 10) || '',
    commercialInsuranceExpiry: vehicle.commercialInsuranceExpiry?.slice(0, 10) || '',
    ownerType: vehicle.ownerType,
    ownerId: vehicle.ownerId || '',
    ownerName: vehicle.ownerName || '',
    ownerPhone: vehicle.ownerPhone || '',
    drivers: vehicle.drivers.map(item => ({ driverId: item.driverId, role: item.role })),
    deviceType: vehicle.deviceType || 'NONE',
    deviceNo: vehicle.deviceNo || '',
    deviceInstalledAt: vehicle.deviceInstalledAt?.slice(0, 10) || '',
    status: vehicle.status,
    remark: vehicle.remark || '',
  };
  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={back}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">编辑车辆</h1><p className="mt-1 text-sm text-muted-foreground">已被 {vehicle._count?.waybills || 0} 张物流运单引用；历史运单保留调度时快照</p></div></div><VehicleForm initialValue={initialValue} submitLabel="保存车辆" onSubmit={update} onCancel={back} showStatus /></div>;
}
