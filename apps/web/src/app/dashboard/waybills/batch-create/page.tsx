import { redirect } from 'next/navigation';

// 旧链接保留跳转，不再提供独立的批量建单页面。
export default function LegacyBatchCreateWaybillPage({ searchParams }: { searchParams: { dispatchNoticeId?: string } }) {
  const query = searchParams.dispatchNoticeId
    ? '?dispatchNoticeId=' + encodeURIComponent(searchParams.dispatchNoticeId)
    : '';
  redirect('/dashboard/waybills/create' + query);
}
