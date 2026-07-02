import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

describe('RICSE API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean data in dependency order
    await prisma.approval.deleteMany();
    await prisma.contractLineItem.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.material.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Auth', () => {
    const testUser = { username: 'testuser', password: 'test123', name: '测试用户', role: 'USER' };

    beforeEach(async () => {
      const hashed = await bcrypt.hash(testUser.password, 10);
      await prisma.user.create({
        data: { ...testUser, password: hashed },
      });
    });

    it('POST /auth/login — 成功登录并返回 JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser.username, password: testUser.password })
        .expect(201);

      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.token).not.toBe('placeholder-jwt-token');
      expect(res.body.username).toBe(testUser.username);
      expect(res.body.name).toBe(testUser.name);
    });

    it('POST /auth/login — 密码错误', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser.username, password: 'wrong' })
        .expect(401);

      expect(res.body.message).toBe('用户名或密码错误');
    });

    it('POST /auth/login — 用户不存在', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent', password: 'test123' })
        .expect(401);

      expect(res.body.message).toBe('用户名或密码错误');
    });

    it('GET /auth/profile — 需要 JWT', async () => {
      // Without token
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .expect(401);

      // Login first
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser.username, password: testUser.password });
      const token = loginRes.body.token;

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.username).toBe(testUser.username);
    });
  });

  describe('Contracts', () => {
    let adminToken: string;
    let supplierId: string;
    let materialId: string;

    beforeEach(async () => {
      // Create admin user
      const hashed = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: { username: 'admin', password: hashed, name: '管理员', role: 'ADMIN' },
      });

      // Create test master data
      const supplier = await prisma.supplier.create({
        data: { code: 'SUP-TEST', name: '测试供应商' },
      });
      supplierId = supplier.id;

      const material = await prisma.material.create({
        data: { code: 'MAT-TEST', name: '测试物料', category: '测试', unit: 'TON' },
      });
      materialId = material.id;

      // Login to get token
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'admin123' });
      adminToken = loginRes.body.token;
    });

    it('POST /contracts — 创建合同', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'E2E 测试合同',
          type: 'PURCHASE',
          supplierId,
          totalAmount: 100000,
          lineItems: [{ materialId, materialName: '测试物料', quantity: 100, unit: 'TON', unitPrice: 1000 }],
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.contractNo).toMatch(/^PO-/);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.lineItems).toHaveLength(1);
    });

    it('GET /contracts — 合同列表', async () => {
      await prisma.contract.create({
        data: { contractNo: 'PO-TEST', title: '列表测试', type: 'PURCHASE', supplierId, totalAmount: 50000, createdBy: 'admin' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/contracts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.pagination).toHaveProperty('total');
    });

    describe('状态机', () => {
      let contractId: string;

      beforeEach(async () => {
        const c = await prisma.contract.create({
          data: { contractNo: 'PO-SM', title: '状态机测试', type: 'PURCHASE', supplierId, totalAmount: 50000, createdBy: 'admin' },
        });
        contractId = c.id;
      });

      it('DRAFT → PENDING_APPROVAL', async () => {
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

      it('DRAFT → COMPLETED — 非法跳转', async () => {
        await request(app.getHttpServer())
          .patch(`/api/v1/contracts/${contractId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'COMPLETED' })
          .expect(400);
      });
    });
  });

  describe('Master Data', () => {
    let authToken: string;

    beforeEach(async () => {
      const hashed = await bcrypt.hash('test123', 10);
      await prisma.user.create({
        data: { username: 'e2euser', password: hashed, name: 'E2E 用户', role: 'USER' },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'e2euser', password: 'test123' });
      authToken = loginRes.body.token;
    });

    it('CRUD 供应商', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/master-data/suppliers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'SUP-CRUD', name: 'CRUD 供应商', contactPerson: '测试', contactPhone: '13800000000' })
        .expect(201);
      expect(created.body.name).toBe('CRUD 供应商');

      const list = await request(app.getHttpServer())
        .get('/api/v1/master-data/suppliers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('CRUD 物料', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/master-data/materials')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'MAT-CRUD', name: 'CRUD 物料', category: '测试', unit: 'TON' })
        .expect(201);
      expect(created.body.name).toBe('CRUD 物料');
    });

    it('CRUD 仓库', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/master-data/warehouses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'WH-CRUD', name: 'CRUD 仓库', address: '测试地址' })
        .expect(201);
      expect(created.body.name).toBe('CRUD 仓库');
    });
  });
});
