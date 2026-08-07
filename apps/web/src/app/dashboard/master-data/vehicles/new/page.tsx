'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { VehicleForm, VehicleFormValue } from '@/components/vehicle-form';

export default function NewVehiclePage() {
  const router = useRouter();
  const back = () => router.push('/dashboard/master-data?tab=vehicles');
  const create = async (value: VehicleFormValue) => {
    try {
      await api.post('/partners/vehicles', payload(value));
      back();
    } catch (error: any) {
      alert(error.message || '车辆创建失败');
      throw error;
    }
  };
  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={back}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">新建车辆</h1><p className="mt-1 text-sm text-muted-foreground">登记完整车辆档案、承运归属、关联司机和定位设备</p></div></div><VehicleForm submitLabel="创建车辆" onSubmit={create} onCancel={back} /></div>;
}

function payload(value: VehicleFormValue) {
  return {
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
  };
}
