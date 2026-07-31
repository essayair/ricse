'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, CircleCheckBig } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AutomaticInboundNoticePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/inbound')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">入库作业单由系统自动生成</h1>
          <p className="mt-1 text-sm text-muted-foreground">主业务流程不手工新建，避免同一采购运单重复建单</p>
        </div>
      </div>
      <Card className="space-y-5 p-6">
        <div className="flex items-start gap-3">
          <CircleCheckBig className="mt-0.5 h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold">自动生成条件</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              采购物流运单确认发运、进入在途时，系统会自动生成状态为“待到货”的入库作业单；
              运单确认到达时还会再次检查并补生成漏单。
            </p>
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-4 text-sm leading-6">
          请返回入库单列表跟踪运输到达、签收、过磅和质检进度。最终验收质检确认合格后，
          仓管核对入库仓库，并补齐实际收货时间、收货人和现场附件后确认收货。
        </div>
        <Button onClick={() => router.push('/dashboard/inbound')}>返回入库单管理</Button>
      </Card>
    </div>
  );
}
