import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { Prisma } from '@prisma/client';

type PendingNotice = {
  recipientUserId: string;
  type: 'APPROVAL' | 'FIELD_TASK';
  businessType: string;
  businessId: string;
  title: string;
  content: string;
  pagePath: string;
};

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;
  private accessTokenCache?: { token: string; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: AccessControlService,
  ) {}

  onModuleInit() {
    const first = setTimeout(() => void this.runCycle(), 5_000);
    first.unref();
    this.timer = setInterval(() => void this.runCycle(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  subscriptionConfig() {
    const approvalTemplateId = this.config.get<string>('WX_SUBSCRIBE_APPROVAL_TEMPLATE_ID')?.trim() || '';
    const taskTemplateId = this.config.get<string>('WX_SUBSCRIBE_TASK_TEMPLATE_ID')?.trim() || '';
    return {
      enabled: Boolean(approvalTemplateId || taskTemplateId),
      templateIds: [...new Set([approvalTemplateId, taskTemplateId].filter(Boolean))],
      types: {
        approval: approvalTemplateId || null,
        fieldTask: taskTemplateId || null,
      },
    };
  }

  async list(userId: string, status?: string) {
    await this.syncAll();
    const normalized = status === 'DONE' ? 'DONE' : status === 'PENDING' ? 'PENDING' : undefined;
    return this.prisma.notification.findMany({
      where: { recipientUserId: userId, ...(normalized ? { status: normalized } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async unreadCount(userId: string) {
    await this.syncAll();
    return {
      count: await this.prisma.notification.count({
        where: { recipientUserId: userId, status: 'PENDING', readAt: null },
      }),
    };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, status: 'PENDING', readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async enableWechatForPending(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, status: 'PENDING', wechatStatus: { in: ['PENDING', 'FAILED', 'SKIPPED'] } },
      data: { wechatStatus: 'PENDING', wechatAttempts: 0, wechatError: null },
    });
    // 用户刚完成一次性订阅授权，立即尝试发送，避免等待下一轮扫描。
    void this.dispatchWechat();
    return { success: true };
  }

  async syncAll() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const [approvals, weighTasks, qualityTasks, inboundReceipts, outboundReceipts, paymentApprovals] = await Promise.all([
        this.prisma.approval.findMany({
          where: { status: 'PENDING', contract: { deletedAt: null, status: 'PENDING_APPROVAL' } },
          select: {
            id: true, assigneeId: true, nodeName: true,
            contract: { select: { id: true, contractNo: true, title: true } },
          },
        }),
        this.prisma.weighTask.findMany({
          where: { deletedAt: null, status: { in: ['PENDING_WEIGHING', 'IN_PROGRESS', 'PENDING_CONFIRMATION', 'EXCEPTION'] } },
          select: {
            id: true, taskNo: true, createdBy: true,
            waybill: { select: { id: true, plateNo: true, dispatchNotice: { select: { order: { select: { contract: { select: { businessUnitId: true } } } } } } } },
          },
        }),
        this.prisma.qualityTask.findMany({
          where: { deletedAt: null, status: { in: ['PENDING_SAMPLING', 'PENDING_SENDING', 'INSPECTING', 'PENDING_DECISION', 'RECHECK_REQUIRED', 'EXCEPTION'] } },
          select: {
            id: true, taskNo: true, createdBy: true, handlerId: true,
            waybill: { select: { plateNo: true, dispatchNotice: { select: { order: { select: { contract: { select: { businessUnitId: true } } } } } } } },
          },
        }),
        this.prisma.inboundReceipt.findMany({
          where: { deletedAt: null, status: { in: ['PENDING', 'RECEIVED'] } },
          select: {
            id: true, receiptNo: true, createdBy: true, plateNo: true,
            waybill: { select: { dispatchNotice: { select: { order: { select: { contract: { select: { businessUnitId: true } } } } } } } },
          },
        }),
        this.prisma.outboundReceipt.findMany({
          where: { deletedAt: null, status: { in: ['PENDING', 'READY', 'VARIANCE_PENDING'] } },
          select: {
            id: true, receiptNo: true, createdBy: true, plateNo: true,
            waybill: { select: { dispatchNotice: { select: { order: { select: { contract: { select: { businessUnitId: true } } } } } } } },
          },
        }),
        this.prisma.paymentRequestApproval.findMany({
          where: { status: 'PENDING', paymentRequest: { status: 'PENDING_APPROVAL' } },
          select: { id: true, assigneeId: true, nodeName: true, paymentRequest: { select: { id: true, requestNo: true, amount: true } } },
        }),
      ]);

      const notices: PendingNotice[] = approvals.map((item) => ({
        recipientUserId: item.assigneeId,
        type: 'APPROVAL',
        businessType: 'CONTRACT_APPROVAL',
        businessId: item.id,
        title: '合同待审批',
        content: `${item.nodeName}：${item.contract.title || item.contract.contractNo}`,
        pagePath: `pages/approvals/detail?contractId=${encodeURIComponent(item.contract.id)}`,
      }));
      const paymentScopes = new Map<string, Prisma.PaymentRequestWhereInput | null>();
      for (const item of paymentApprovals) {
        if (!paymentScopes.has(item.assigneeId)) {
          try {
            const context = await this.access.getContext(item.assigneeId);
            paymentScopes.set(item.assigneeId, context.isAdmin || context.permissions.includes('settlement.payment.approve') ? await this.access.getPaymentRequestScope(item.assigneeId, 'settlement.payment.approve') : null);
          } catch { paymentScopes.set(item.assigneeId, null); }
        }
        const scope = paymentScopes.get(item.assigneeId);
        if (!scope || !await this.prisma.paymentRequest.findFirst({ where: { id: item.paymentRequest.id, AND: [scope] }, select: { id: true } })) continue;
        notices.push({ recipientUserId: item.assigneeId, type: 'APPROVAL', businessType: 'PAYMENT_APPROVAL', businessId: item.id,
          title: '付款申请待审批', content: `${item.nodeName}：${item.paymentRequest.requestNo} · ${item.paymentRequest.amount.toFixed(2)}元`,
          pagePath: `pages/approvals/detail?paymentRequestId=${encodeURIComponent(item.paymentRequest.id)}` });
      }

      await this.appendFieldTaskNotices(notices, 'WEIGH_TASK', 'quality.manage', weighTasks.map((item) => ({
        id: item.id, ownerId: item.createdBy,
        businessUnitId: item.waybill.dispatchNotice.order.contract.businessUnitId,
        title: '待办磅单', content: `${item.taskNo}${item.waybill.plateNo ? ` · ${item.waybill.plateNo}` : ''}`,
        pagePath: `pages/business/detail?module=weigh-tickets&id=${encodeURIComponent(item.waybill.id)}`,
      })));
      await this.appendFieldTaskNotices(notices, 'QUALITY_TASK', 'quality.manage', qualityTasks.map((item) => ({
        id: item.id, ownerId: item.handlerId || item.createdBy,
        businessUnitId: item.waybill.dispatchNotice.order.contract.businessUnitId,
        title: '待办质检', content: `${item.taskNo}${item.waybill.plateNo ? ` · ${item.waybill.plateNo}` : ''}`,
        pagePath: `pages/business/detail?module=quality-tasks&id=${encodeURIComponent(item.id)}`,
      })));
      await this.appendFieldTaskNotices(notices, 'INBOUND_RECEIPT', 'inventory.manage', inboundReceipts.map((item) => ({
        id: item.id, ownerId: item.createdBy,
        businessUnitId: item.waybill.dispatchNotice.order.contract.businessUnitId,
        title: '待办入库', content: `${item.receiptNo}${item.plateNo ? ` · ${item.plateNo}` : ''}`,
        pagePath: `pages/business/detail?module=inbound-receipts&id=${encodeURIComponent(item.id)}`,
      })));
      await this.appendFieldTaskNotices(notices, 'OUTBOUND_RECEIPT', 'inventory.manage', outboundReceipts.map((item) => ({
        id: item.id, ownerId: item.createdBy,
        businessUnitId: item.waybill.dispatchNotice.order.contract.businessUnitId,
        title: '待办出库', content: `${item.receiptNo}${item.plateNo ? ` · ${item.plateNo}` : ''}`,
        pagePath: `pages/business/detail?module=outbound-receipts&id=${encodeURIComponent(item.id)}`,
      })));

      for (const notice of notices) await this.upsertNotice(notice);
      await Promise.all([
        this.completeMissing('CONTRACT_APPROVAL', this.activeKeys(notices, 'CONTRACT_APPROVAL')),
        this.completeMissing('PAYMENT_APPROVAL', this.activeKeys(notices, 'PAYMENT_APPROVAL')),
        this.completeMissing('WEIGH_TASK', this.activeKeys(notices, 'WEIGH_TASK')),
        this.completeMissing('QUALITY_TASK', this.activeKeys(notices, 'QUALITY_TASK')),
        this.completeMissing('INBOUND_RECEIPT', this.activeKeys(notices, 'INBOUND_RECEIPT')),
        this.completeMissing('OUTBOUND_RECEIPT', this.activeKeys(notices, 'OUTBOUND_RECEIPT')),
      ]);
    } catch (error) {
      this.logger.error(`同步移动待办提醒失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.syncing = false;
    }
  }

  private async appendFieldTaskNotices(
    notices: PendingNotice[],
    businessType: string,
    permissionCode: string,
    tasks: Array<{ id: string; ownerId: string; businessUnitId: string | null; title: string; content: string; pagePath: string }>,
  ) {
    const cache = new Map<string, string[]>();
    for (const task of tasks) {
      const key = `${permissionCode}:${task.businessUnitId || '-'}`;
      let recipients = cache.get(key);
      if (!recipients) {
        recipients = await this.permissionRecipients(permissionCode, task.businessUnitId);
        cache.set(key, recipients);
      }
      const resolved = recipients.length ? recipients : [task.ownerId];
      for (const recipientUserId of new Set(resolved)) {
        notices.push({
          recipientUserId, type: 'FIELD_TASK', businessType, businessId: task.id,
          title: task.title, content: task.content, pagePath: task.pagePath,
        });
      }
    }
  }

  private async permissionRecipients(permissionCode: string, businessUnitId: string | null) {
    if (!businessUnitId) return [];
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        employee: { status: 'ACTIVE' },
        company: { status: 'ACTIVE' },
        businessUnits: {
          some: {
            businessUnitId, status: 'ACTIVE', effectiveAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        roleAssignments: {
          some: {
            status: 'ACTIVE', effectiveAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: { status: 'ACTIVE', permissions: { some: { permission: { code: permissionCode } } } },
          },
        },
      },
      select: { id: true },
    });
    return users.map((item) => item.id);
  }

  private upsertNotice(notice: PendingNotice) {
    const dedupeKey = `${notice.businessType}:${notice.businessId}:${notice.recipientUserId}`;
    return this.prisma.notification.upsert({
      where: { dedupeKey },
      create: { ...notice, dedupeKey },
      update: {
        title: notice.title, content: notice.content, pagePath: notice.pagePath,
        status: 'PENDING', completedAt: null,
      },
    });
  }

  private activeKeys(notices: PendingNotice[], businessType: string) {
    return notices
      .filter((notice) => notice.businessType === businessType)
      .map((notice) => `${notice.businessType}:${notice.businessId}:${notice.recipientUserId}`);
  }

  private completeMissing(businessType: string, activeKeys: string[]) {
    return this.prisma.notification.updateMany({
      where: {
        businessType, status: 'PENDING',
        ...(activeKeys.length ? { dedupeKey: { notIn: activeKeys } } : {}),
      },
      data: { status: 'DONE', completedAt: new Date(), readAt: new Date() },
    });
  }

  private async runCycle() {
    await this.syncAll();
    await this.dispatchWechat();
  }

  private async dispatchWechat() {
    const config = this.subscriptionConfig();
    if (!config.enabled) return;
    const rows = await this.prisma.notification.findMany({
      where: { status: 'PENDING', wechatStatus: { in: ['PENDING', 'FAILED'] }, wechatAttempts: { lt: 3 } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const row of rows) await this.sendWechat(row.id);
  }

  private async sendWechat(id: string) {
    const claimed = await this.prisma.notification.updateMany({
      where: { id, status: 'PENDING', wechatStatus: { in: ['PENDING', 'FAILED'] }, wechatAttempts: { lt: 3 } },
      data: { wechatStatus: 'SENDING', wechatAttempts: { increment: 1 }, wechatError: null },
    });
    if (!claimed.count) return;
    const notice = await this.prisma.notification.findUnique({
      where: { id },
      include: { recipient: { select: { wechatIdentity: { select: { openId: true, status: true } } } } },
    });
    if (!notice) return;
    const openId = notice.recipient.wechatIdentity?.status === 'ACTIVE'
      ? notice.recipient.wechatIdentity.openId
      : null;
    const templateId = notice.type === 'APPROVAL'
      ? this.config.get<string>('WX_SUBSCRIBE_APPROVAL_TEMPLATE_ID')?.trim()
      : this.config.get<string>('WX_SUBSCRIBE_TASK_TEMPLATE_ID')?.trim();
    if (!openId || !templateId) {
      await this.prisma.notification.update({ where: { id }, data: { wechatStatus: 'SKIPPED', wechatError: !openId ? '用户未关联小程序账号' : '消息模板未配置' } });
      return;
    }
    try {
      const token = await this.getAccessToken();
      const data = notice.type === 'APPROVAL'
        ? {
            thing2: { value: this.truncate(notice.title, 20) },
            time3: { value: this.formatTime(notice.createdAt) },
            thing4: { value: this.truncate(notice.content, 20) },
          }
        : {
            thing1: { value: this.truncate(notice.title, 20) },
            thing2: { value: this.truncate(notice.content, 20) },
            time3: { value: this.formatTime(notice.createdAt) },
          };
      const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openId,
          template_id: templateId,
          page: notice.pagePath,
          miniprogram_state: this.config.get<string>('WX_MINIPROGRAM_STATE') || 'formal',
          lang: 'zh_CN',
          data,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || body.errcode !== 0) throw new Error(body.errmsg || `HTTP ${response.status}`);
      await this.prisma.notification.update({
        where: { id }, data: { wechatStatus: 'SENT', wechatSentAt: new Date(), wechatError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.notification.update({ where: { id }, data: { wechatStatus: 'FAILED', wechatError: message.slice(0, 500) } });
      this.logger.warn(`微信订阅消息发送失败：${message}`);
    }
  }

  private async getAccessToken() {
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) return this.accessTokenCache.token;
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');
    if (!appid || !secret) throw new Error('微信 AppID/AppSecret 尚未配置');
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`, { signal: AbortSignal.timeout(8_000) });
    const body: any = await response.json().catch(() => ({}));
    if (!body.access_token) throw new Error(body.errmsg || '获取微信接口凭证失败');
    const expiresIn = Math.max(300, Number(body.expires_in || 7200));
    this.accessTokenCache = { token: body.access_token, expiresAt: Date.now() + (expiresIn - 120) * 1000 };
    return this.accessTokenCache.token;
  }

  private truncate(value: string, max: number) {
    return [...value].slice(0, max).join('');
  }

  private formatTime(value: Date) {
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
}
