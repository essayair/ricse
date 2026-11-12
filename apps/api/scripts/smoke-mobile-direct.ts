/** 本地移动API真实Guard验收，不替代安卓/iOS设备交互。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WechatTokenService } from '../src/modules/common/wechat-token.service';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const config: Record<string, string> = {}; for (const line of env.split('\n')) { const match = line.match(/^(\w+)\s*=\s*["']?([^"'\r\n]*)/); if (match) config[match[1]] = match[2]; }
  const url = new URL(process.env.DATABASE_URL || config.DATABASE_URL); assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/ricse_dev');
  const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); assert(result.tag.startsWith('E2E-ZB-'));
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } }); let id: string | undefined, checks = 0;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: result.ui.id } }); assert(user.username.startsWith(result.tag));
    const openId = `QA-MOBILE-${randomUUID()}`;
    id = (await db.wechatIdentity.create({ data: { openId, linkedUserId: user.id } })).id;
    const token = new WechatTokenService(new ConfigService({ ...config, ...process.env })).sign(openId);
    const get = async (path: string, method = 'GET', body?: object, expected = 200) => { const r = await fetch(`http://127.0.0.1:3000/api/v1/mobile${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const b: any = await r.json(); assert.equal(r.status, expected, `${path} ${JSON.stringify(b)}`); checks++; return b; };
    await get('/workspace'); await get('/business-modules');
    const waybill = await db.waybill.findFirstOrThrow({ where: { dispatchNotice: { directSalesExecution: { is: { contractId: result.ids.contractId } } } } });
    const w = await get(`/business/waybills/${waybill.id}`); assert.equal(w.id, waybill.id);
    const direct = await get(`/bilateral-direct/waybills/${waybill.id}`); assert(direct.deliveries.some((d: any) => d.snapshot.evidenceSides));
    const task = await db.qualityTask.findUniqueOrThrow({ where: { waybillId: waybill.id } });
    const partners = await get(`/quality-institutions?qualityTaskId=${task.id}&institutionType=PARTNER`); assert(partners.length >= 2);
    await get(`/bilateral-direct/waybills/${waybill.id}/reverse`, 'POST', { reason: '本地移动端禁止绕过下游占用测试' }, 400);
    await db.wechatIdentity.update({ where: { id }, data: { status: 'DISABLED' } }); await get('/workspace', 'GET', undefined, 401);
    console.log(JSON.stringify({ result: 'PASS', checks, scope: '移动API真实Guard、任务、双侧快照、机构、下游占用与身份停用', cleanup: '仅自建微信身份' }));
  } finally { if (id) await db.wechatIdentity.delete({ where: { id } }); await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
