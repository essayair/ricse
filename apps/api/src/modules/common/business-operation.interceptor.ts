import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, mergeMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

type BusinessContext = {
  businessType: string;
  businessId?: string;
  isCreate?: boolean;
  isDetail?: boolean;
};

const ROOT_TYPES: Record<string, string> = {
  contracts: 'CONTRACT',
  orders: 'ORDER',
  'dispatch-notices': 'DISPATCH_NOTICE',
  waybills: 'WAYBILL',
  'weigh-tickets': 'WEIGH_TICKET',
  'quality-tasks': 'QUALITY_TASK',
  'quality-inspections': 'QUALITY_INSPECTION',
  'inbound-receipts': 'INBOUND_RECEIPT',
  'outbound-receipts': 'OUTBOUND_RECEIPT',
  'inventory-reversals': 'INVENTORY_REVERSAL',
};

const STATIC_SEGMENTS = new Set([
  'form-options', 'attachments', 'contracts', 'orders', 'dispatch-notices', 'waybills',
  'availability', 'traceability', 'eligible-waybills', 'eligible-sources', 'eligible-lots',
  'management-files',
]);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿', PENDING_APPROVAL: '待审批', APPROVED: '已审批', REJECTED: '已驳回',
  EXECUTING: '执行中', COMPLETED: '已完成', CLOSED: '已关闭', VOIDED: '已作废',
  CANCELLED: '已取消', CONFIRMED: '已确认', DISPATCHED: '已发运', ISSUED: '已下达',
  IN_PROGRESS: '执行中', PENDING: '待处理', WEIGHING: '称重中', RECEIVED: '已收货',
  READY: '待放行', VARIANCE_PENDING: '待差异处理', IN_TRANSIT: '运输中', ARRIVED: '已到达',
  SIGNED: '已签收', REVIEWED: '已复核', POSTED: '已过账', RELEASED: '已下达',
  MATERIAL_PREPARED: '已备料', PENDING_QC: '待质检', PARTIAL_COMPLETED: '部分完工',
};

@Injectable()
export class BusinessOperationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BusinessOperationInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = String(request.method || '').toUpperCase();
    const business = this.resolveBusinessContext(request.path || request.url || '', method);

    if (!business) return next.handle();

    return next.handle().pipe(mergeMap(async (response) => {
      if (method === 'GET' && business.isDetail && business.businessId && response && typeof response === 'object') {
        const operationLogs = await this.findOperationLogs(business.businessType, business.businessId);
        if (!operationLogs.some((item) => item.action === 'CREATE') && (response as any).createdAt) {
          const creatorId = (response as any).createdBy || (response as any).creator?.id;
          const embeddedCreator = (response as any).creator;
          const creator = creatorId && !embeddedCreator?.username
            ? await this.prisma.user.findUnique({
              where: { id: creatorId },
              select: { id: true, name: true, username: true },
            })
            : embeddedCreator;
          if (creator) {
            operationLogs.push({
              id: `created-${business.businessType}-${business.businessId}`,
              action: 'CREATE',
              actionLabel: '创建单据',
              details: null,
              createdAt: new Date((response as any).createdAt),
              operator: {
                id: creator.id || creatorId || '',
                name: creator.name || '',
                username: creator.username || '',
              },
            });
            operationLogs.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
          }
        }
        return { ...response, operationLogs };
      }

      const operatorId = request.user?.id as string | undefined;
      if (!operatorId || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return response;
      const target = this.resolveOperationTarget(business, response);
      const businessId = target.businessId || (response as any)?.id;
      if (!businessId) return response;

      const action = this.resolveAction(method, request.path || request.url || '', request.body, business.isCreate);
      try {
        await this.prisma.businessOperationLog.create({
          data: {
            businessType: target.businessType,
            businessId,
            action: action.code,
            actionLabel: action.label,
            operatorId,
            details: this.operationDetails(request.body),
          },
        });
      } catch (error) {
        // 审计记录异常不得让已经完成的业务动作在客户端表现为失败，避免用户重复提交单据。
        this.logger.error(`业务操作记录写入失败：${target.businessType}/${businessId}`, error as Error);
      }
      if (response && typeof response === 'object' && (response as any).id === businessId) {
        return {
          ...response,
          operationLogs: await this.findOperationLogs(target.businessType, businessId),
        };
      }
      return response;
    }));
  }

  private resolveOperationTarget(business: BusinessContext, response: unknown): BusinessContext {
    const result = response as any;
    if (business.businessType === 'OUTBOUND_RECEIPT' && result?.outboundOrderId) {
      return { businessType: 'OUTBOUND_ORDER', businessId: result.outboundOrderId };
    }
    if (business.businessType === 'QUALITY_INSPECTION' && result?.qualityTaskId) {
      return { businessType: 'QUALITY_TASK', businessId: result.qualityTaskId };
    }
    if (business.businessType === 'PRODUCTION_COMPLETION') {
      const taskId = result?.taskId || (result?.id && result.id !== business.businessId ? result.id : undefined);
      if (taskId) return { businessType: 'PRODUCTION_TASK', businessId: taskId };
    }
    return business;
  }

  private findOperationLogs(businessType: string, businessId: string) {
    return this.prisma.businessOperationLog.findMany({
      where: { businessType, businessId },
      select: {
        id: true,
        action: true,
        actionLabel: true,
        details: true,
        createdAt: true,
        operator: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private resolveBusinessContext(path: string, method: string): BusinessContext | null {
    const segments = path.split('?')[0].split('/').filter(Boolean);
    const productionIndex = segments.indexOf('production');
    if (productionIndex >= 0) {
      const section = segments[productionIndex + 1];
      const type = section === 'recipes'
        ? 'PRODUCTION_RECIPE'
        : section === 'tasks'
          ? 'PRODUCTION_TASK'
          : section === 'completions'
            ? 'PRODUCTION_COMPLETION'
            : null;
      if (!type) return null;
      const candidateId = segments[productionIndex + 2];
      return {
        businessType: type,
        businessId: candidateId,
        isCreate: method === 'POST' && !candidateId,
        isDetail: method === 'GET' && !!candidateId && segments.length === productionIndex + 3,
      };
    }

    const rootIndex = segments.findIndex((segment) => ROOT_TYPES[segment]);
    if (rootIndex < 0) return null;
    const root = segments[rootIndex];
    if (root === 'outbound-receipts' && segments[rootIndex + 1] === 'orders') {
      const outboundOrderId = segments[rootIndex + 2];
      return {
        businessType: 'OUTBOUND_ORDER',
        businessId: outboundOrderId,
        isDetail: method === 'GET' && !!outboundOrderId && segments.length === rootIndex + 3,
      };
    }
    const candidateId = segments[rootIndex + 1];
    const hasBusinessId = !!candidateId && !STATIC_SEGMENTS.has(candidateId);
    return {
      businessType: ROOT_TYPES[root],
      businessId: hasBusinessId ? candidateId : undefined,
      isCreate: method === 'POST' && !candidateId,
      isDetail: method === 'GET' && hasBusinessId && segments.length === rootIndex + 2,
    };
  }

  private resolveAction(method: string, path: string, body: any, isCreate?: boolean) {
    if (isCreate) return { code: 'CREATE', label: '创建单据' };
    if (path.includes('/attachments')) {
      if (method === 'POST') return { code: 'UPLOAD_ATTACHMENT', label: '上传附件' };
      if (method === 'DELETE') return { code: 'DELETE_ATTACHMENT', label: '删除附件' };
      return { code: 'RENAME_ATTACHMENT', label: '修改附件名称' };
    }
    if (path.endsWith('/assignment')) return { code: 'ASSIGN', label: '更新调度信息' };
    if (path.endsWith('/records') || path.endsWith('/records/batch')) return { code: 'WEIGH', label: '新增称重记录' };
    if (path.endsWith('/effective-records')) return { code: 'SELECT_WEIGHT', label: '选择有效称重记录' };
    if (path.endsWith('/settlement')) return { code: 'SETTLEMENT', label: '更新结算重量口径' };
    if (path.endsWith('/acceptance-quality')) return { code: 'QUALITY_SELECT', label: '选择验收入库质检口径' };
    if (path.endsWith('/refresh-reservation')) return { code: 'RESERVE_REFRESH', label: '刷新库存预占' };
    if (path.endsWith('/confirm')) return { code: 'CONFIRM', label: '确认业务单据' };
    if (path.endsWith('/submit')) return { code: 'SUBMIT', label: '提交业务单据' };
    if (path.endsWith('/review')) return { code: 'REVIEW', label: '审核业务单据' };
    if (path.endsWith('/variance')) return { code: 'VARIANCE', label: '处理数量差异' };
    if (path.endsWith('/release')) return { code: 'RELEASE', label: '下达生产任务' };
    if (path.endsWith('/reservations')) return { code: 'RESERVE', label: '更新物料预占' };
    if (path.endsWith('/issue')) return { code: 'ISSUE', label: '确认生产领料' };
    if (path.endsWith('/consume')) return { code: 'CONSUME', label: '登记生产耗用' };
    if (path.endsWith('/return')) return { code: 'RETURN', label: '登记生产退料' };
    if (path.endsWith('/completions')) return { code: 'COMPLETE_DECLARE', label: '提交完工申报' };
    if (path.endsWith('/quality')) return { code: 'QUALITY_CONFIRM', label: '确认质量结果' };
    if (path.endsWith('/post')) return { code: 'POST', label: '业务过账' };
    if (path.endsWith('/finalize')) return { code: 'FINALIZE', label: '形成最终结论' };
    if (path.endsWith('/close')) return { code: 'CLOSE', label: '关闭单据' };
    if (path.endsWith('/cancel')) return { code: 'CANCEL', label: '取消单据' };
    if (path.endsWith('/status')) {
      const status = body?.status;
      return { code: 'STATUS_CHANGE', label: status ? `状态变更为“${STATUS_LABELS[status] || status}”` : '更新单据状态' };
    }
    if (method === 'DELETE') return { code: 'DELETE', label: '删除单据' };
    if (method === 'PATCH' || method === 'PUT') return { code: 'UPDATE', label: '编辑单据信息' };
    return { code: 'OPERATE', label: '执行业务操作' };
  }

  private operationDetails(body: any): Prisma.InputJsonValue | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const details: Record<string, string | number | boolean> = {};
    for (const key of ['status', 'reason', 'remarks', 'remark', 'conclusion']) {
      const value = body[key];
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        details[key] = typeof value === 'string' ? value.slice(0, 500) : value;
      }
    }
    return Object.keys(details).length ? details : undefined;
  }
}
