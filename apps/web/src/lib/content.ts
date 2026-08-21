export const ARTICLE_TYPE: Record<string, string> = { NEWS: '行业资讯', SUPPLY: '供应信息', DEMAND: '采购需求' };
export const ARTICLE_STATUS: Record<string, string> = { DRAFT: '草稿', PUBLISHED: '已发布', OFFLINE: '已下线' };
export const SUPPLY_STATUS: Record<string, string> = { PENDING: '待审核', PUBLISHED: '已发布', REJECTED: '已驳回', OFFLINE: '已下线' };
export const CONTACT_STATUS: Record<string, string> = { NEW: '待处理', FOLLOWING: '跟进中', COMPLETED: '已完成', INVALID: '无效' };
export const JOB_STATUS: Record<string, string> = { PENDING: '待执行', RUNNING: '执行中', SUCCEEDED: '成功', FAILED: '失败', CANCELLED: '已取消' };
export const JOB_TYPE: Record<string, string> = { NEWS_SYNC: '资讯同步', AI_CLEAN: 'AI 清洗', MARKET_SYNC: '萤石市场行情采集', FLUORSPAR_TREND_SYNC: '萤石区域趋势采集', HF_MARKET_SYNC: '国际氢氟酸行情采集', DATA_IMPORT: '数据导入' };

export function contentDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value)).replace(/\//g, '-');
}
