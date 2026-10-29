import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { reconcileLegacyReceipt } from '../prisma/reconcile-legacy-inventory';

/**
 * 这套 e2e 测试跑在本地开发数据库上（没有单独的测试库），因此绝不做
 * 整表 deleteMany —— 那会清空种子账号、审批角色和其他正在进行中的工作。
 * 所有在这里创建的数据都带 E2E_RUN 标记并记录 ID，在 afterAll 里精确按
 * ID 删除，不触碰任何既有数据。
 */
describe('RICSE API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const RUN = `E2E${Date.now()}`;
  // 内部合作伙伴编码要求恰好 6 位字母数字且全局唯一，不能直接用 RUN；
  // 两处用到内部合作伙伴的 describe 块各自要一个独立的码，否则会撞唯一约束。
  const INTERNAL_CODE = Date.now().toString().slice(-6);
  const INTERNAL_CODE_2 = (Date.now() + 1).toString().slice(-6);

  const approvalFields = async () => {
    const businessUnit = await prisma.businessUnit.findFirst({ where: { status: 'ACTIVE' } });
    const department = await prisma.department.findFirst();
    if (!businessUnit || !department) throw new Error('端到端测试缺少业务单元或部门种子数据');
    return {
      businessUnitId: businessUnit.id, departmentId: department.id,
      externalNo: '无', pricingType: 'FIXED', signedAt: '2026-10-01T00:00:00.000Z',
      deliveryMethod: '汽运', deliveryLocation: '测试仓库', settlementBasis: '按实际入库数量',
      settlementMethod: '到货结算', paymentMethod: '银行转账', prepayPct: 0, paymentDays: 0,
      overfillPct: 10, shortfallPct: 10,
    };
  };
  const attachSignedContract = (contractId: string) => prisma.attachment.create({ data: {
    contractId, fileName: `e2e-${RUN}-${contractId}.pdf`, originalName: '测试纸质合同.pdf',
    mimeType: 'application/pdf', size: 16, category: 'SIGNED_CONTRACT',
  } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth', () => {
    const username = `${RUN}_user`;
    const password = 'test12345';
    let userId: string;

    beforeAll(async () => {
      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { username, password: hashed, name: 'E2E 临时账号', role: 'USER' },
      });
      userId = user.id;
    });

    afterAll(async () => {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    });

    it('POST /auth/login — 成功登录并返回 token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(201);

      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.username).toBe(username);
      // 没有任何有效角色分配时，权限列表必须是空数组，不能回落成"默认有权限"。
      expect(res.body.permissions).toEqual([]);
    });

    it('POST /auth/login — 密码错误', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toBe('用户名、手机号或密码错误');
    });

    it('POST /auth/login — 用户不存在', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: `${RUN}_nonexistent`, password: 'whatever123' })
        .expect(401);

      expect(res.body.message).toBe('用户名、手机号或密码错误');
    });

    it('GET /auth/profile — 未带 token 拒绝，带 token 返回本人信息', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/profile').expect(401);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);

      expect(res.body.username).toBe(username);
    });

    it('退出登录后旧访问令牌和刷新令牌均不可用，重新登录恢复访问', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(201);

      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${first.body.token}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${first.body.token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${first.body.token}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken })
        .expect(401);

      const second = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(201);
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${second.body.token}`)
        .expect(200);
      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${refreshed.body.token}`)
        .expect(200);
    });
  });

  /**
   * 以下两组都需要 master_data.manage / contract.* 权限，这些权限完全由
   * UserRoleAssignment 真实角色分配决定（AccessControlService.getContext
   * 只读角色分配表，不读 User.role 字段），所以不手工拼装权限，直接登录
   * 种子数据里的 admin 账号——这也顺带验证了种子数据本身没坏。
   */
  describe('业务主数据与合同（以种子 admin 账号登录）', () => {
    let adminToken: string;
    const createdPartnerIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdMaterialIds: string[] = [];
    const createdWarehouseIds: string[] = [];
    const createdContractIds: string[] = [];

    beforeAll(async () => {
      const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: adminPassword })
        .expect(201);
      adminToken = loginRes.body.token;
      expect(loginRes.body.permissions).toEqual(
        expect.arrayContaining(['master_data.manage', 'contract.create', 'contract.approve']),
      );
    });

    afterAll(async () => {
      // ContractLineItem/Approval 对 Contract 是 onDelete: Restrict，不会随合同级联删除，
      // 必须先清掉子表才能物理删除测试合同；否则合同（进而物料/分类）会一直卡着删不掉。
      if (createdContractIds.length) {
        await prisma.attachment.deleteMany({ where: { contractId: { in: createdContractIds } } });
        await prisma.contractLineItem.deleteMany({ where: { contractId: { in: createdContractIds } } });
        await prisma.approval.deleteMany({ where: { contractId: { in: createdContractIds } } });
      }
      for (const id of createdContractIds) {
        await prisma.contract.delete({ where: { id } }).catch(() => undefined);
      }
      // 建物料时后台会自动生成一条平台标准商品（standardCommodityId），物料分类
      // 又被标准商品引用，所以要按 物料 → 标准商品 → 分类 的顺序倒着删。
      const standardCommodityIds: string[] = [];
      for (const id of createdMaterialIds) {
        const material = await prisma.material.findUnique({ where: { id }, select: { standardCommodityId: true } });
        if (material?.standardCommodityId) standardCommodityIds.push(material.standardCommodityId);
        await prisma.material.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of standardCommodityIds) {
        await prisma.standardCommodity.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of createdCategoryIds) {
        await prisma.materialCategory.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of createdWarehouseIds) {
        await prisma.warehouse.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of createdPartnerIds) {
        await prisma.partner.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it('POST /partners — 创建供应商合作伙伴', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/partners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${RUN}-测试供应商`, roles: ['SUPPLIER'] })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.roles).toContain('SUPPLIER');
      createdPartnerIds.push(res.body.id);
    });

    it('POST /master-data/material-categories + /materials — 创建物料分类与物料', async () => {
      const category = await request(app.getHttpServer())
        .post('/api/v1/master-data/material-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${RUN}-测试分类` })
        .expect(201);
      createdCategoryIds.push(category.body.id);

      const material = await request(app.getHttpServer())
        .post('/api/v1/master-data/materials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: category.body.id,
          baseName: '萤石',
          commodityForm: '精粉',
          coreSpecName: 'CaF₂',
          coreSpecOperator: 'GTE',
          coreSpecValue: '97',
          coreSpecUnit: '%',
          packageType: 'BULK',
          unit: 'TON',
        })
        .expect(201);

      expect(material.body).toHaveProperty('id');
      expect(material.body.code).toMatch(/^(TRD|RAW|SFG|FGD)/);
      createdMaterialIds.push(material.body.id);
    });

    it('POST /master-data/warehouses — 创建仓库', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/master-data/warehouses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: `${RUN}-WH`, name: `${RUN}-测试仓库` })
        .expect(201);

      expect(res.body.name).toBe(`${RUN}-测试仓库`);
      createdWarehouseIds.push(res.body.id);
    });

    describe('合同创建与状态流转', () => {
      let sellerId: string;
      let signingPartnerId: string;
      let materialId: string;

      beforeAll(async () => {
        const seller = await request(app.getHttpServer())
          .post('/api/v1/partners')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: `${RUN}-合同测试供应商`, roles: ['SUPPLIER'] });
        sellerId = seller.body.id;
        createdPartnerIds.push(sellerId);

        // 提交审批前必须有我方签约主体；内部合作伙伴要求显式指定编码。
        const signingPartner = await request(app.getHttpServer())
          .post('/api/v1/partners')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: `${RUN}-我方签约主体`, isInternal: true, code: INTERNAL_CODE, roles: ['CUSTOMER'] });
        signingPartnerId = signingPartner.body.id;
        createdPartnerIds.push(signingPartnerId);

        const category = await request(app.getHttpServer())
          .post('/api/v1/master-data/material-categories')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: `${RUN}-合同测试分类` });
        createdCategoryIds.push(category.body.id);

        const material = await request(app.getHttpServer())
          .post('/api/v1/master-data/materials')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            categoryId: category.body.id,
            baseName: '萤石',
            commodityForm: '精粉',
            coreSpecName: 'CaF₂',
            coreSpecOperator: 'GTE',
            coreSpecValue: '95',
            coreSpecUnit: '%',
            packageType: 'BULK',
            unit: 'TON',
          });
        materialId = material.body.id;
        createdMaterialIds.push(materialId);
      });

      it('POST /contracts — 创建采购合同草稿', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/contracts')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ...await approvalFields(),
            title: `${RUN}-采购合同`,
            type: 'PURCHASE',
            sellerId,
            signingPartnerId,
            totalAmount: 100000,
            lineItems: [{ materialId, quantity: 100, unit: 'TON', unitPrice: 1000 }],
          })
          .expect(201);

        expect(res.body.contractNo).toMatch(/^CG/);
        expect(res.body.status).toBe('DRAFT');
        expect(res.body.lineItems).toHaveLength(1);
        createdContractIds.push(res.body.id);
      });

      it('GET /contracts — 合同列表能查到刚创建的草稿', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/contracts')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ search: `${RUN}-采购合同` })
          .expect(200);

        expect(res.body.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.pagination).toHaveProperty('total');
        expect(res.body.items[0].title).toBe(`${RUN}-采购合同`);
      });

      describe('状态机', () => {
        let contractId: string;

        beforeEach(async () => {
          const res = await request(app.getHttpServer())
            .post('/api/v1/contracts')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              ...await approvalFields(),
              title: `${RUN}-状态机测试`,
              type: 'PURCHASE',
              sellerId,
              signingPartnerId,
              totalAmount: 50000,
              lineItems: [{ materialId, quantity: 50, unit: 'TON', unitPrice: 1000 }],
            });
          contractId = res.body.id;
          createdContractIds.push(contractId);
          await attachSignedContract(contractId);
        });

        it('DRAFT → PENDING_APPROVAL（种子数据已配置四级或签审批流）', async () => {
          const res = await request(app.getHttpServer())
            .patch(`/api/v1/contracts/${contractId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'PENDING_APPROVAL' })
            .expect(200);
          expect(res.body.status).toBe('PENDING_APPROVAL');
        });

        it('DRAFT → VOIDED', async () => {
          const res = await request(app.getHttpServer())
            .patch(`/api/v1/contracts/${contractId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'VOIDED' })
            .expect(200);
          expect(res.body.status).toBe('VOIDED');
        });

        it('DRAFT → COMPLETED — 非法跳转必须拒绝', async () => {
          await request(app.getHttpServer())
            .patch(`/api/v1/contracts/${contractId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'COMPLETED' })
            .expect(400);
        });
      });
    });
  });

  /**
   * 合同 → 执行批次 → 执行通知 → 物流运单 这条主链路。
   * 执行批次必须从「已通过」的合同建立，所以这里要真的走完四级或签审批
   * （而不是像上面那组测试一样只提交到待审批就停），再继续往下游建单。
   */
  describe('执行链路：合同审批 → 执行批次 → 执行通知 → 物流运单', () => {
    let adminToken: string;
    const approverTokens: Record<string, string> = {};
    const createdPartnerIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdMaterialIds: string[] = [];
    let contractId: string;
    let orderId: string;
    let noticeId: string;
    let waybillId: string;

    beforeAll(async () => {
      const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: adminPassword })
        .expect(201);
      adminToken = adminLogin.body.token;

      // 四级或签审批链的种子账号，密码与 admin 不同（见 prisma/seed.ts）。
      const approverPassword = process.env.SEED_APPROVER_PASSWORD || 'approver123';
      for (const username of ['business_manager', 'risk_manager', 'business_owner', 'general_manager']) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ username, password: approverPassword })
          .expect(201);
        approverTokens[username] = res.body.token;
      }

      const signingPartner = await request(app.getHttpServer())
        .post('/api/v1/partners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${RUN}-执行链路签约主体`, isInternal: true, code: INTERNAL_CODE_2, roles: ['CUSTOMER'] });
      createdPartnerIds.push(signingPartner.body.id);

      const seller = await request(app.getHttpServer())
        .post('/api/v1/partners')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${RUN}-执行链路供应商`, roles: ['SUPPLIER'] });
      createdPartnerIds.push(seller.body.id);

      const category = await request(app.getHttpServer())
        .post('/api/v1/master-data/material-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${RUN}-执行链路分类` });
      createdCategoryIds.push(category.body.id);

      const material = await request(app.getHttpServer())
        .post('/api/v1/master-data/materials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: category.body.id,
          baseName: '萤石',
          commodityForm: '精粉',
          coreSpecName: 'CaF₂',
          coreSpecOperator: 'GTE',
          coreSpecValue: '92',
          coreSpecUnit: '%',
          packageType: 'BULK',
          unit: 'TON',
          pricingQuantityBasis: 'DRY_MATTER',
        });
      createdMaterialIds.push(material.body.id);

      const contract = await request(app.getHttpServer())
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...await approvalFields(),
          title: `${RUN}-执行链路合同`,
          type: 'PURCHASE',
          sellerId: seller.body.id,
          signingPartnerId: signingPartner.body.id,
          totalAmount: 20000,
          lineItems: [{ materialId: material.body.id, quantity: 20, unit: 'TON', unitPrice: 1000 }],
        });
      contractId = contract.body.id;

      await attachSignedContract(contractId);

      await request(app.getHttpServer())
        .patch(`/api/v1/contracts/${contractId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PENDING_APPROVAL' })
        .expect(200);

      // 按步骤顺序走完四级或签：业务主管(运营经理)→风控/财务经理→业务责任人→总经理。
      for (const username of ['business_manager', 'risk_manager', 'business_owner', 'general_manager']) {
        await request(app.getHttpServer())
          .patch(`/api/v1/contracts/${contractId}/status`)
          .set('Authorization', `Bearer ${approverTokens[username]}`)
          .send({ status: 'APPROVED', comment: 'e2e 自动化审批通过' })
          .expect(200);
      }

      const check = await request(app.getHttpServer())
        .get(`/api/v1/contracts/${contractId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(check.body.status).toBe('APPROVED');
    });

    afterAll(async () => {
      // 依赖顺序（深→浅）：称重记录/磅单/过磅任务/质检任务/物流入库单 都挂在 Waybill 下；
      // Waybill 挂在 DispatchNotice 下；DispatchNotice 挂在 Order 下；Order 挂在 Contract 下。
      const waybillIds = waybillId ? [waybillId] : [];
      const inbounds = await prisma.inboundReceipt.findMany({ where: { waybillId: { in: waybillIds } }, select: { id: true } });
      const businessInbounds = await prisma.businessInbound.findMany({ where: { receiptId: { in: inbounds.map(i => i.id) } }, select: { id: true } });
      const lots = await prisma.inventoryLot.findMany({ where: { businessInboundId: { in: businessInbounds.map(i => i.id) } }, select: { id: true } });
      await prisma.inventoryLedger.deleteMany({ where: { lotId: { in: lots.map(i => i.id) } } });
      await prisma.inventoryLot.deleteMany({ where: { id: { in: lots.map(i => i.id) } } });
      await prisma.businessInbound.deleteMany({ where: { id: { in: businessInbounds.map(i => i.id) } } });
      await prisma.inboundReceipt.deleteMany({ where: { id: { in: inbounds.map(i => i.id) } } });
      const inspections = await prisma.qualityInspection.findMany({ where: { qualityTask: { waybillId: { in: waybillIds } } }, select: { id: true } });
      await prisma.qualityTask.updateMany({ where: { waybillId: { in: waybillIds } }, data: { basisInspectionId: null } });
      await prisma.qualityInspectionIndicator.deleteMany({ where: { inspectionId: { in: inspections.map(i => i.id) } } });
      await prisma.qualityInspection.deleteMany({ where: { id: { in: inspections.map(i => i.id) } } });
      await prisma.waybillWeightSelection.deleteMany({ where: { waybillId: { in: waybillIds } } });
      await prisma.attachment.deleteMany({ where: { weighTicket: { waybillId: { in: waybillIds } } } });
      await prisma.weighRecord.deleteMany({ where: { weighTicket: { waybillId: { in: waybillIds } } } });
      await prisma.weighTicket.deleteMany({ where: { waybillId: { in: waybillIds } } });
      await prisma.weighTask.deleteMany({ where: { waybillId: { in: waybillIds } } });
      await prisma.qualityTask.deleteMany({ where: { waybillId: { in: waybillIds } } });
      await prisma.waybillLineItem.deleteMany({ where: { waybillId: { in: waybillIds } } });
      for (const id of waybillIds) await prisma.waybill.delete({ where: { id } }).catch(() => undefined);

      if (noticeId) {
        await prisma.dispatchNoticeLineItem.deleteMany({ where: { dispatchNoticeId: noticeId } });
        await prisma.dispatchNotice.delete({ where: { id: noticeId } }).catch(() => undefined);
      }
      if (orderId) {
        await prisma.orderLineItem.deleteMany({ where: { orderId } });
        await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
      }
      if (contractId) {
        await prisma.attachment.deleteMany({ where: { contractId } });
        await prisma.contractLineItem.deleteMany({ where: { contractId } });
        await prisma.approval.deleteMany({ where: { contractId } });
        await prisma.contract.delete({ where: { id: contractId } }).catch(() => undefined);
      }
      for (const id of createdMaterialIds) {
        const material = await prisma.material.findUnique({ where: { id }, select: { standardCommodityId: true } });
        await prisma.material.delete({ where: { id } }).catch(() => undefined);
        if (material?.standardCommodityId) {
          await prisma.standardCommodity.delete({ where: { id: material.standardCommodityId } }).catch(() => undefined);
        }
      }
      for (const id of createdCategoryIds) {
        await prisma.materialCategory.delete({ where: { id } }).catch(() => undefined);
      }
      for (const id of createdPartnerIds) {
        await prisma.partner.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it('合同通过四级或签后状态为 APPROVED（上面 beforeAll 已验证，这里只是显式留一条可读的断言）', () => {
      expect(contractId).toBeTruthy();
    });

    it('POST /orders — 只能从已通过合同建立执行批次', async () => {
      const contractDetail = await request(app.getHttpServer())
        .get(`/api/v1/contracts/${contractId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const lineItemId = contractDetail.body.lineItems[0].id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `${RUN}-执行批次`,
          contractId,
          type: 'PURCHASE',
          lineItems: [{ contractLineItemId: lineItemId, quantity: 10 }],
        })
        .expect(201);

      expect(res.body.orderNo).toMatch(/^CGDD/);
      expect(res.body.status).toBe('DRAFT');
      orderId = res.body.id;
    });

    it('PATCH /orders/:id/status — 确认执行批次', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CONFIRMED' })
        .expect(200);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('POST /dispatch-notices — 从已确认执行批次建立供应商发货指令', async () => {
      const orderDetail = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const orderLineItemId = orderDetail.body.lineItems[0].id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/dispatch-notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId,
          originLocation: `${RUN}-发货地`,
          destinationLocation: `${RUN}-收货地`,
          lineItems: [{ orderLineItemId, quantity: 10 }],
        })
        .expect(201);

      expect(res.body.noticeNo).toMatch(/^PI-/);
      expect(res.body.status).toBe('DRAFT');
      noticeId = res.body.id;
    });

    it('PATCH /dispatch-notices/:id/status — 下达通知', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/dispatch-notices/${noticeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ISSUED' })
        .expect(200);
      expect(res.body.status).toBe('ISSUED');
    });

    it('POST /waybills — 从已下达通知建立物流运单，执行批次自动转为执行中', async () => {
      const noticeDetail = await request(app.getHttpServer())
        .get(`/api/v1/dispatch-notices/${noticeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const noticeLineItemId = noticeDetail.body.lineItems[0].id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/waybills')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dispatchNoticeId: noticeId,
          freightMode: 'SELF',
          plateNo: `${RUN}-99999`,
          driverName: `${RUN}-司机`,
          driverPhone: '13900000000',
          lineItems: [{ dispatchNoticeLineItemId: noticeLineItemId, quantity: 10 }],
        })
        .expect(201);

      expect(res.body.waybillNo).toMatch(/^WB-/);
      expect(res.body.status).toBe('PENDING');
      waybillId = res.body.id;

      const orderAfter = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(orderAfter.body.status).toBe('DISPATCHED');
    });

    it('PATCH /waybills/:id/status — 发运后自动生成待到货入库作业单', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/waybills/${waybillId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_TRANSIT' })
        .expect(200);

      const inbound = await prisma.inboundReceipt.findFirst({ where: { waybillId } });
      expect(inbound).not.toBeNull();
      expect(inbound?.status).toBe('PENDING');
    });

    it('PATCH /waybills/:id/status — 到达后自动生成过磅任务与质检任务', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/waybills/${waybillId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARRIVED' })
        .expect(200);
      expect(res.body.status).toBe('ARRIVED');

      const weighTask = await prisma.weighTask.findUnique({ where: { waybillId } });
      const qualityTask = await prisma.qualityTask.findUnique({ where: { waybillId } });
      expect(weighTask).not.toBeNull();
      expect(qualityTask).not.toBeNull();
    });

    it('POST /weigh-tickets/:id/records — 系统已自动生成待过磅单，可直接录入毛重/皮重', async () => {
      const tickets = await request(app.getHttpServer())
        .get('/api/v1/weigh-tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ waybillId });
      const ticketId = tickets.body.items[0].id;

      await request(app.getHttpServer())
        .post(`/api/v1/weigh-tickets/${ticketId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ weighingType: 'GROSS', weight: 42.0 })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/weigh-tickets/${ticketId}/records`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ weighingType: 'TARE', weight: 32.0 })
        .expect(201);

      // 10 吨净重与计划数量一致，不应触发磅差异常。
      expect(Number(res.body.netWeight)).toBeCloseTo(10, 3);
      expect(res.body.abnormal).toBe(false);
    });

    it('最终质检水分驱动折干入库：实物 10 吨、计价 8.8 吨', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
      const ticket = await prisma.weighTicket.findFirstOrThrow({ where: { waybillId } });
      const task = await prisma.qualityTask.findUniqueOrThrow({ where: { waybillId } });
      const receipt = await prisma.inboundReceipt.findFirstOrThrow({ where: { waybillId } });
      const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { status: 'ACTIVE' } });
      await prisma.attachment.create({ data: {
        weighTicketId: ticket.id, fileName: `e2e-${RUN}-weigh.pdf`, originalName: '测试磅单.pdf',
        mimeType: 'application/pdf', size: 16, category: 'WEIGH_TICKET',
      } });
      await request(app.getHttpServer()).patch(`/api/v1/weigh-tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`).send({ status: 'COMPLETED' }).expect(200);
      await request(app.getHttpServer()).patch(`/api/v1/weigh-tickets/${ticket.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`).send({ status: 'REVIEWED' }).expect(200);
      const report = await prisma.qualityInspection.create({ data: {
        inspectionNo: `E2E-Q-${RUN}`, qualityTaskId: task.id, weighTicketId: ticket.id,
        status: 'CONFIRMED', conclusion: 'PASS', institutionName: '端到端测试检测机构', reportNo: `R-${RUN}`,
        testedAt: new Date(), sampledAt: new Date(), samplerName: '测试取样人', materialName: '萤石精粉', createdBy: user.id,
        indicators: { create: [{ code: 'MOISTURE', name: '水分', operator: 'LTE', unit: '%', measuredValue: 12, result: 'PASS' }] },
      } });
      await prisma.qualityTask.update({ where: { id: task.id }, data: {
        status: 'COMPLETED', basisInspectionId: report.id, finalConclusion: 'PASS', qualityDisposition: 'PASS',
      } });
      await prisma.inboundReceipt.update({ where: { id: receipt.id }, data: {
        weighTicketId: ticket.id, qualityInspectionId: report.id, acceptanceConclusion: 'PASS',
        warehouseId: warehouse.id, receivedAt: new Date(), receiverName: '测试收货人',
      } });
      const pending = await request(app.getHttpServer()).get(`/api/v1/inbound-receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(pending.body.reportMeasuredMoisturePct).toBe(12);
      const confirmed = await request(app.getHttpServer()).patch(`/api/v1/inbound-receipts/${receipt.id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(Number(confirmed.body.receivedQuantity)).toBe(10);
      expect(Number(confirmed.body.pricingQuantity)).toBe(8.8);
      await request(app.getHttpServer()).post(`/api/v1/inbound-receipts/${receipt.id}/post`)
        .set('Authorization', `Bearer ${adminToken}`).expect(201);
      const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { businessInbound: { receiptId: receipt.id } } });
      expect(Number(lot.availableQuantity)).toBe(10);
      expect(Number(lot.pricingAvailableQuantity)).toBe(8.8);
      expect(lot.pricingQuantityBasis).toBe('DRY_MATTER');
    });

    it('历史已过账且无下游业务的批次，自动根据磅单和质检补全双数量并保留旧值', async () => {
      const receipt = await prisma.inboundReceipt.findFirstOrThrow({ where: { waybillId } });
      const inbound = await prisma.businessInbound.findUniqueOrThrow({ where: { receiptId: receipt.id } });
      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { businessInboundId: inbound.id } });
      const ledger = await prisma.inventoryLedger.findFirstOrThrow({ where: { lotId: lot.id } });
      await prisma.inboundReceipt.update({ where: { id: receipt.id }, data: {
        receivedQuantity: 8, legacyReceivedQuantity: 8, pricingQuantity: 8,
        pricingQuantityBasis: 'PHYSICAL', measuredMoisturePct: null, quantitySource: 'LEGACY_UNVERIFIED',
      } });
      await prisma.businessInbound.update({ where: { id: inbound.id }, data: {
        quantity: 8, legacyQuantity: 8, pricingQuantity: 8, pricingQuantityBasis: 'PHYSICAL', measuredMoisturePct: null,
      } });
      await prisma.inventoryLot.update({ where: { id: lot.id }, data: {
        initialQuantity: 8, availableQuantity: 8, legacyInitialQuantity: 8, legacyAvailableQuantity: 8,
        pricingInitialQuantity: 8, pricingAvailableQuantity: 8, pricingQuantityBasis: 'PHYSICAL', quantitySource: 'LEGACY_UNVERIFIED',
      } });
      await prisma.inventoryLedger.update({ where: { id: ledger.id }, data: {
        quantityChange: 8, balanceAfter: 8, legacyQuantityChange: 8, legacyBalanceAfter: 8,
        pricingQuantityChange: 8, pricingBalanceAfter: 8,
      } });
      const historical = await prisma.inboundReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: {
        weighTicket: true, qualityInspection: { include: { indicators: true } },
        waybill: { include: { qualityTask: true, lineItems: true, weightSelections: true, dispatchNotice: { include: { order: true } } } },
        businessInbound: { include: { inventoryLot: true } },
      } });
      await expect(reconcileLegacyReceipt(historical, prisma, true)).resolves.toBe('POSTED_RECONCILED');
      const repaired = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
      expect(Number(repaired.initialQuantity)).toBe(10);
      expect(Number(repaired.pricingInitialQuantity)).toBe(8.8);
      expect(Number(repaired.legacyInitialQuantity)).toBe(8);
      expect(repaired.quantitySource).toBe('HISTORICAL_RECONCILED');
      const repairedLedger = await prisma.inventoryLedger.findUniqueOrThrow({ where: { id: ledger.id } });
      expect(Number(repairedLedger.quantityChange)).toBe(10);
      expect(Number(repairedLedger.pricingQuantityChange)).toBe(8.8);
      expect(Number(repairedLedger.legacyQuantityChange)).toBe(8);
    });
  });
});
