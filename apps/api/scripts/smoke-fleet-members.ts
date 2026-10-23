/** 本地车队成员真实数据库冒烟；新增档案和分组关系全部在事务中回滚。 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { FleetService } from '../src/modules/master-data/fleet.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/dev|test/i.test(url.pathname)) throw new Error('仅允许本机开发/测试数据库');
  const prisma = new PrismaService();
  const rollback = new Error('EXPECTED_FLEET_ROLLBACK');
  const ids: { fleet?: string; driver?: string; vehicle?: string } = {};
  let complete = false;
  try {
    await prisma.$transaction(async tx => {
      const service = new FleetService(tx as PrismaService);
      const fleet = await service.create({ name: 'FLEET_SMOKE_' + randomUUID().slice(0, 8) });
      const driver = await tx.driver.create({ data: { name: '回滚测试司机', phone: '199' + randomInt(100000000).toString().padStart(8, '0') } });
      const vehicle = await tx.vehicle.create({ data: { plateNo: '浙Z' + randomInt(100000).toString().padStart(5, '0'), vehicleType: 'SEMI_TRAILER', ownerType: 'OUTSOURCED', loadCapacity: 32 } });
      ids.fleet = fleet.id; ids.driver = driver.id; ids.vehicle = vehicle.id;
      await service.addDriver(fleet.id, driver.id);
      await service.addVehicle(fleet.id, vehicle.id);
      const joined = await service.findOne(fleet.id);
      assert.equal(joined.driverLinks.length, 1); assert.equal(joined.vehicleLinks.length, 1);
      assert.equal(joined._count.driverLinks, 1); assert.equal(joined._count.vehicleLinks, 1);
      await assert.rejects(() => service.addDriver(fleet.id, driver.id), /已在此车队/);
      await assert.rejects(() => service.addVehicle(fleet.id, vehicle.id), /已在此车队/);
      await service.removeDriver(fleet.id, driver.id);
      await service.removeVehicle(fleet.id, vehicle.id);
      assert.equal((await service.findOne(fleet.id)).driverLinks.length, 0);
      assert.equal((await service.findOne(fleet.id)).vehicleLinks.length, 0);
      assert(await tx.driver.findUnique({ where: { id: driver.id } }));
      assert(await tx.vehicle.findUnique({ where: { id: vehicle.id } }));
      await service.update(fleet.id, { status: 'INACTIVE' });
      await assert.rejects(() => service.addDriver(fleet.id, driver.id), /车队已停用/);
      await service.update(fleet.id, { status: 'ACTIVE' });
      await tx.driver.update({ where: { id: driver.id }, data: { status: 'INACTIVE' } });
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: 'MAINTENANCE' } });
      await assert.rejects(() => service.addDriver(fleet.id, driver.id), /司机不存在或已停用/);
      await assert.rejects(() => service.addVehicle(fleet.id, vehicle.id), /车辆不存在或已停用/);
      complete = true;
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await prisma.$disconnect(); }
  assert(complete);
  const check = new PrismaService();
  try {
    assert.equal(await check.fleet.count({ where: { id: ids.fleet } }), 0);
    assert.equal(await check.driver.count({ where: { id: ids.driver } }), 0);
    assert.equal(await check.vehicle.count({ where: { id: ids.vehicle } }), 0);
  } finally { await check.$disconnect(); }
  console.log('PASS 司机/车辆加入、重复校验、移出、人数刷新、档案保留、停用状态校验；所有测试记录已回滚');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
