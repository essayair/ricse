/** 仅验证本机开发库；创建并清理自己的QA记录，不修改既有主体名称。 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServiceOrganizationService } from '../src/modules/master-data/service-organization.service';

async function main() {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = readFileSync('.env', 'utf8').match(/^DATABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  const url = new URL(process.env.DATABASE_URL || '');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/ricse_dev', '仅允许本地ricse_dev');
  const db = new PrismaService(), service = new ServiceOrganizationService(db);
  let partnerId: string | undefined;
  const tag = `QA-SERVICE-${randomUUID().slice(0, 8)}`;
  try {
    const legacy = await db.serviceOrganization.findMany({ select: { id: true, name: true, partner: { select: { name: true } } } });
    assert(legacy.every(item => item.name.trim()), '存量服务名称不得为空');
    console.log(`PASS 存量名称非空检查（${legacy.length}条）`);
    const partner = await db.partner.create({ data: { code: tag, name: `${tag}法定主体`, roles: ['SUPPLIER'] } }); partnerId = partner.id;
    const same = await service.create({ partnerId, organizationType: 'LOGISTICS_CARRIER' });
    assert.equal(same.name, partner.name); console.log('PASS 兼容旧客户端省略名称，默认关联伙伴名');
    const custom = await service.create({ partnerId, organizationType: 'QUALITY_INSTITUTION', name: `${tag}检测中心` });
    assert.notEqual(custom.name, partner.name);
    await service.update(custom.id, { name: `${tag}新检测中心` });
    assert.equal((await db.partner.findUniqueOrThrow({ where: { id: partnerId } })).name, partner.name);
    await db.partner.update({ where: { id: partnerId }, data: { name: `${tag}主体更名` } });
    assert.equal((await service.findOne(custom.id)).name, `${tag}新检测中心`);
    const found = await service.findAll({ search: `${tag}新检测中心` });
    assert(found.items.some(item => item.id === custom.id));
    console.log('PASS 服务名称独立编辑、伙伴更名不联动、名称可搜索');
  } finally {
    if (partnerId) { await db.serviceOrganization.deleteMany({ where: { partnerId } }); await db.partner.delete({ where: { id: partnerId } }); }
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
