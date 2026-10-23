/** 本地司机车辆联合登记冒烟：数据库事务整体回滚；真实 MinIO 测试文件在 finally 中清理。 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { FileService } from '../src/modules/common/file.service';
import { TransportResourceService } from '../src/modules/master-data/transport-resource.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const storageUrl = new URL((process.env.MINIO_ENDPOINT || 'localhost').includes('://') ? process.env.MINIO_ENDPOINT! : 'http://' + (process.env.MINIO_ENDPOINT || 'localhost'));
  if (![url.hostname, storageUrl.hostname].every(host => ['localhost', '127.0.0.1', '[::1]'].includes(host)) || !/dev|test/i.test(url.pathname)) throw new Error('仅允许本机开发/测试数据库和文件存储');
  const tag = 'TRANSPORT_SMOKE_' + randomUUID().slice(0, 8), rollback = new Error('EXPECTED_ROLLBACK');
  const prisma = new PrismaService(), keys: string[] = [], deleted: string[] = [];
  const originalFiles = new FileService(new ConfigService({ MINIO_PUBLIC_ENDPOINT: '127.0.0.1', MINIO_PUBLIC_PORT: process.env.MINIO_PORT || '9002', MINIO_PUBLIC_USE_SSL: 'false' }));
  const files = new Proxy(originalFiles, { get(target, key) {
    if (key === 'upload') return async (buffer: Buffer, originalName: string, mimeType: string) => {
      const result = await target.upload(buffer, originalName, mimeType, tag); keys.push(result.fileName); return result;
    };
    if (key === 'delete') return async (name: string) => { await target.delete(name); deleted.push(name); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const phone = () => '199' + randomInt(100000000).toString().padStart(8, '0');
  const plate = () => '浙Z' + randomInt(100000).toString().padStart(5, '0');
  const pdf = () => { const buffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'); return { buffer, originalname: '模拟证件.pdf', mimetype: 'application/pdf', size: buffer.length } as Express.Multer.File; };
  let complete = false;
  try {
    await prisma.$transaction(async tx => {
      let savepoint = 0;
      const db: PrismaService = new Proxy(tx as PrismaService, { get(target, key) {
        if (key === '$transaction') return async (callback: (client: PrismaService) => unknown) => {
          const name = 'transport_smoke_' + ++savepoint;
          await tx.$executeRawUnsafe('SAVEPOINT ' + name);
          try { const result = await callback(db); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); return result; }
          catch (error) { await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + name); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); throw error; }
        };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const role = await tx.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
      const user = await tx.user.create({ data: { username: tag, name: '回滚运力测试管理员', password: randomUUID(), role: 'ADMIN', roleAssignments: { create: { roleId: role.id, scopeType: 'ALL' } } } });
      const service = new TransportResourceService(db, new AccessControlService(db), files);
      const vehicleData = () => ({ plateNo: plate(), vehicleType: 'SEMI_TRAILER', ownerType: 'OUTSOURCED', loadCapacity: 32 });
      const driverData = () => ({ name: '模拟司机', phone: phone() });
      const first = await service.create({ newDriver: driverData() }, { driverAttachments: [pdf()] }, user.id);
      assert(first.driverId && !first.vehicleId && !first.linked);
      const vehicleOnly = await service.create({ newVehicle: vehicleData() }, { vehicleAttachments: [pdf()] }, user.id);
      assert(vehicleOnly.vehicleId && !vehicleOnly.driverId);
      const both = await service.create({ newDriver: driverData(), newVehicle: vehicleData() }, { driverAttachments: [pdf()], vehicleAttachments: [pdf()] }, user.id);
      assert(both.linked);
      assert.equal(await tx.vehicleDriver.count({ where: { vehicleId: both.vehicleId!, driverId: both.driverId!, role: 'PRIMARY' } }), 1);
      const existingDriver = await service.create({ driverId: first.driverId!, newVehicle: vehicleData() }, { vehicleAttachments: [pdf()] }, user.id);
      assert(existingDriver.linked && !existingDriver.driverCreated);
      const existingVehicle = await service.create({ newDriver: driverData(), vehicleId: both.vehicleId! }, { driverAttachments: [pdf()] }, user.id);
      assert.equal(await tx.vehicleDriver.count({ where: { vehicleId: both.vehicleId!, role: 'PRIMARY', driverId: both.driverId! } }), 1);
      assert.equal(await tx.vehicleDriver.count({ where: { vehicleId: both.vehicleId!, role: 'SECONDARY', driverId: existingVehicle.driverId! } }), 1);
      await service.create({ driverId: existingVehicle.driverId!, vehicleId: both.vehicleId! }, {}, user.id);
      assert.equal(await tx.vehicleDriver.count({ where: { vehicleId: both.vehicleId! } }), 2);
      const failedDriver = driverData(), existing = await tx.vehicle.findUniqueOrThrow({ where: { id: both.vehicleId! } });
      const deletedBefore = deleted.length;
      await assert.rejects(() => service.create({ newDriver: failedDriver, newVehicle: { ...vehicleData(), plateNo: existing.plateNo } }, { driverAttachments: [pdf()], vehicleAttachments: [pdf()] }, user.id), /车牌号已存在/);
      assert.equal(await tx.driver.count({ where: { phone: failedDriver.phone } }), 0, '联合失败不能留下司机');
      assert.equal(deleted.length - deletedBefore, 2, '联合失败清理两边已上传文件');
      const attachment = await tx.attachment.findFirstOrThrow({ where: { driverId: first.driverId } });
      await assert.rejects(() => service.attachment('drivers', first.driverId!, attachment.id, user.id, true), /至少保留一份/);
      const result = await service.attachment('drivers', first.driverId!, attachment.id, user.id);
      assert(result && 'url' in result);
      const response = await fetch(result.url); assert(response.ok); assert((await response.text()).startsWith('%PDF-'));
      await assert.rejects(() => service.attachment('vehicles', both.vehicleId!, attachment.id, user.id), /不属于该档案/);
      const added = await service.upload('drivers', first.driverId!, pdf(), user.id);
      await service.attachment('drivers', first.driverId!, attachment.id, user.id, true);
      assert.equal(await tx.attachment.count({ where: { driverId: first.driverId } }), 1);
      assert.equal((await tx.attachment.findUniqueOrThrow({ where: { id: added.id } })).category, 'DRIVER_DOCUMENT');
      console.log('PASS 司机单建、车辆单建、联合建档、已有司机+新车辆、新司机+已有车辆、重复关联不覆盖主驾');
      console.log('PASS 失败无半套档案、真实PDF资料上传/下载/替换、最后附件保护及跨档案拒绝读取');
      complete = true; throw rollback;
    }, { timeout: 120000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await Promise.all(keys.map(key => originalFiles.delete(key))); await prisma.$disconnect(); }
  assert(complete); console.log('PASS 数据库全部回滚，所有模拟文件已清理；未修改原有档案、运单或线上环境');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
