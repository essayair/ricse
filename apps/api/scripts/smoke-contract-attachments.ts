/** 仅本地 dev/test 数据库：验证附件上传元数据到提交审批，全程事务回滚，不上传真实存储文件。 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { ContractService } from '../src/modules/contract/contract.service';
import { ContractController } from '../src/modules/contract/contract.controller';
import { FileService } from '../src/modules/common/file.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/dev|test/i.test(url.pathname)) {
    throw new Error('仅允许本机 dev/test 数据库');
  }
  const prisma = new PrismaService(), tag = 'ATTACH_SMOKE_' + randomUUID().slice(0, 8);
  const rollback = new Error('EXPECTED_ROLLBACK');
  let complete = false;
  try {
    await prisma.$transaction(async tx => {
      const db: PrismaService = new Proxy(tx as PrismaService, { get(target, key) {
        if (key === '$transaction') return async (callback: (client: PrismaService) => unknown) => callback(db);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const company = await tx.company.create({ data: { code: tag, name: tag + '管理组织' } });
      const department = await tx.department.create({ data: { name: '附件回归测试部门', companyId: company.id } });
      const unit = await tx.businessUnit.create({ data: { code: tag, name: '附件回归测试事业部', companyId: company.id } });
      const role = await tx.role.create({ data: { code: tag, name: '附件回归测试审批角色', permissions: {
        create: { permission: { connect: { code: 'contract.approve' } } },
      } } });
      const adminRole = await tx.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
      const user = await tx.user.create({ data: { username: tag, name: '回滚附件测试管理员', password: randomUUID(), role: 'ADMIN', companyId: company.id,
        businessUnits: { create: { businessUnitId: unit.id, isDefault: true } },
        roleAssignments: { create: [{ roleId: adminRole.id, scopeType: 'ALL' }, { roleId: role.id, scopeType: 'ALL' }] },
      } });
      const owner = await tx.partner.create({ data: { code: tag + '_OWNER', name: '回滚内部签约主体', isInternal: true, roles: ['SUPPLIER', 'CUSTOMER'] } });
      const supplier = await tx.partner.create({ data: { code: tag + '_SUP', name: '回滚供应商', roles: ['SUPPLIER'] } });
      const customer = await tx.partner.create({ data: { code: tag + '_CUS', name: '回滚客户', roles: ['CUSTOMER'] } });
      const category = await tx.materialCategory.create({ data: { name: tag } });
      const material = await tx.material.create({ data: { code: tag, name: '回滚测试物料', categoryId: category.id } });
      const service = new ContractService(db, new AccessControlService(db));
      const fileService = { upload: async (buffer: Buffer) => ({ fileName: tag + '/' + randomUUID() + '.pdf', size: buffer.length }) } as unknown as FileService;
      const controller = new ContractController(service, fileService);

      for (const type of ['PURCHASE', 'SALES', 'BILATERAL']) {
        // 仅本事务可见的审批配置，回滚后原流程和节点完整恢复。
        const flow = await tx.approvalFlow.upsert({ where: { contractType: type }, create: { contractType: type, name: '回滚附件测试流程' }, update: { status: 'ACTIVE' } });
        await tx.approvalFlowNode.updateMany({ where: { flowId: flow.id }, data: { enabled: false } });
        const maximum = await tx.approvalFlowNode.aggregate({ where: { flowId: flow.id }, _max: { step: true } });
        await tx.approvalFlowNode.create({ data: { flowId: flow.id, nodeName: '回滚测试审批', step: (maximum._max.step || 0) + 1, roleId: role.id, scopeType: 'BUSINESS_UNIT' } });
        const contract = await tx.contract.create({ data: {
          contractNo: tag + '_' + type, title: '附件回归测试合同', type, status: 'DRAFT', totalAmount: 10000,
          signingPartnerId: owner.id, sellerId: type === 'SALES' ? customer.id : supplier.id,
          buyerId: type === 'BILATERAL' ? customer.id : null, companyId: company.id, departmentId: department.id, businessUnitId: unit.id, createdBy: user.id,
          externalNo: '回滚纸质合同001', signedAt: new Date('2026-10-22T00:00:00+08:00'), pricingType: 'FIXED',
          deliveryMethod: '汽运', deliveryLocation: '回滚测试地址', settlementBasis: 'WEIGHT', settlementMethod: '现款现货',
          prepayPct: 0, paymentDays: 0, paymentMethod: 'T/T', overfillPct: 10, shortfallPct: 10,
          lineItems: { create: { materialId: material.id, materialName: material.name, quantity: 10, unitPrice: 1000, totalPrice: 10000,
            ...(type === 'BILATERAL' ? { salesUnitPrice: 1200, salesTotalPrice: 12000 } : {}),
          } },
        } });
        await assert.rejects(() => service.getApprovalReadiness(contract.id, user.id), /至少上传一份合同附件/);
        await assert.rejects(() => service.updateStatus(contract.id, { status: 'PENDING_APPROVAL' }, user), /至少上传一份合同附件/);
        const buffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
        await controller.uploadAttachment(contract.id, { buffer, originalname: 'contract.pdf', mimetype: 'application/pdf', size: buffer.length } as Express.Multer.File, 'OTHER', '合同签章文件.pdf', user.id);
        assert.equal((await service.findOne(contract.id, user.id)).attachments.length, 1);
        assert.equal((await service.getApprovalReadiness(contract.id, user.id)).ready, true);
        await service.updateStatus(contract.id, { status: 'PENDING_APPROVAL' }, user);
        assert.equal((await tx.contract.findUniqueOrThrow({ where: { id: contract.id } })).status, 'PENDING_APPROVAL');
        assert.equal(await tx.approval.count({ where: { contractId: contract.id, status: 'PENDING' } }), 1);
        console.log('PASS', type, '无附件拦截 / PDF上传元数据 / 审批预检 / 事务内提交审批');
      }
      complete = true;
      throw rollback;
    }, { timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await prisma.$disconnect(); }
  assert(complete);
  console.log('PASS 全部测试记录及审批配置已回滚，未修改原有草稿、真实文件或线上数据');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
