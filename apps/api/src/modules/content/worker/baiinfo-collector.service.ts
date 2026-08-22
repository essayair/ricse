import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const TARGET_IDS = [
  '1588348470396475357', '10441', '10440', '10442', '10443', '10444', '10445',
  '1588348470396474022', '1588348470396474023', '1588348470396474024',
  '1588348470396474025', '1588348470396474026', '1588348470396474027',
  '1588348470396474028', '1588348470396474029', '1588348470396474030',
  '1588348470396474031', '1588348470396474032', '1588348470396508950',
  '1588348470396508951',
];

@Injectable()
export class BaiinfoCollectorService {
  private readonly logger = new Logger(BaiinfoCollectorService.name);
  private runtimeCredential?: { token: string; cookie: string; exp: number };
  private loginInflight?: Promise<{ token: string; cookie: string; exp: number }>;
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async sync() {
    if (!this.hasDirectCredential()) {
      throw new ServiceUnavailableException('百川行情直连凭据尚未配置，旧行情后端已停止使用');
    }
    const credential = await this.ensureCredential();
    const end = this.formatDate(new Date());
    const start = this.formatDate(new Date(Date.now() - 180 * 86400000));
    let response = await this.fetchExport(start, end, credential);
    if ([401, 403].includes(response.status) && this.config.get<string>('BAIINFO_USERNAME')) {
      this.runtimeCredential = await this.login();
      response = await this.fetchExport(start, end, this.runtimeCredential);
    }
    if (!response.ok) throw new ServiceUnavailableException(`百川行情 HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('excel') && !contentType.includes('octet')) {
      const text = await response.text();
      throw new ServiceUnavailableException(`百川未返回 Excel：${text.slice(0, 100)}`);
    }
    const rows = this.parse(Buffer.from(await response.arrayBuffer()));
    const product = await this.prisma.contentProductType.upsert({
      where: { code: 'FLUORITE_97' },
      update: { name: '萤石粉', spec: 'CaF₂≥97%', unit: '元/吨', status: 'ACTIVE' },
      create: { code: 'FLUORITE_97', name: '萤石粉', spec: 'CaF₂≥97%', unit: '元/吨' },
    });
    let saved = 0;
    for (const row of rows) {
      await this.prisma.contentProductPrice.upsert({
        where: { productTypeId_businessDate_region_source_marketName: {
          productTypeId: product.id,
          businessDate: new Date(`${row.date}T00:00:00.000Z`),
          region: row.region,
          source: 'BAIINFO',
          marketName: row.marketName,
        } },
        update: { price: new Prisma.Decimal(row.price), changeAmount: new Prisma.Decimal(row.change), rawData: row as any },
        create: {
          productTypeId: product.id,
          businessDate: new Date(`${row.date}T00:00:00.000Z`),
          region: row.region,
          marketName: row.marketName,
          spec: 'CaF₂≥97%',
          price: new Prisma.Decimal(row.price),
          unit: '元/吨',
          changeAmount: new Prisma.Decimal(row.change),
          source: 'BAIINFO',
          rawData: row as any,
        },
      });
      saved++;
    }
    this.logger.log(`百川行情同步完成 saved=${saved}`);
    return { saved, businessDate: rows[0]?.date || null };
  }

  private hasDirectCredential() {
    return Boolean(
      (this.config.get<string>('BAIINFO_AUTH') && this.config.get<string>('BAIINFO_COOKIE'))
      || (this.config.get<string>('BAIINFO_USERNAME') && this.config.get<string>('BAIINFO_PASSWORD')),
    );
  }

  private fetchExport(start: string, end: string, credential: { token: string; cookie: string }) {
    return fetch('https://www.baiinfo.com/api/website/price/priceInfo/getHistoryPriceExport', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'access-control-check': this.accessControlCheck(),
        'baiinfo-auth': credential.token,
        cookie: credential.cookie,
        iscookies: '1',
        origin: 'https://www.baiinfo.com',
        referer: 'https://www.baiinfo.com/product/historicalPrice?id=335&parentId=335&ids=2268',
        browser: 'Mozilla/5.0',
        'user-agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ channelId: '335', pricesGroupId: 2268, startDate: start, endDate: end, targetIds: TARGET_IDS }),
      signal: AbortSignal.timeout(60_000),
    });
  }

  private async ensureCredential() {
    if (this.runtimeCredential && this.runtimeCredential.exp * 1000 > Date.now() + 86400000) return this.runtimeCredential;
    const token = this.config.get<string>('BAIINFO_AUTH');
    const cookie = this.config.get<string>('BAIINFO_COOKIE');
    if (token && cookie) {
      const exp = this.jwtExp(token);
      if (exp * 1000 > Date.now() + 86400000 || !this.config.get<string>('BAIINFO_USERNAME')) {
        return { token, cookie, exp };
      }
    }
    return this.login();
  }

  private login() {
    if (this.loginInflight) return this.loginInflight;
    this.loginInflight = (async () => {
      const username = this.config.get<string>('BAIINFO_USERNAME');
      const password = this.config.get<string>('BAIINFO_PASSWORD');
      if (!username || !password) throw new ServiceUnavailableException('百川凭据尚未配置或已过期');
      const body = new URLSearchParams({ username, password, grant_type: 'captcha', client_id: 'website', client_secret: 'website' });
      const response = await fetch('https://www.baiinfo.com/api/auth/oauth/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'access-control-check': this.accessControlCheck(),
          browser: 'Mozilla/5.0', iscookies: '1', origin: 'https://www.baiinfo.com', referer: 'https://www.baiinfo.com/login',
        },
        body: body.toString(), signal: AbortSignal.timeout(20_000),
      });
      const result: any = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || !result.data?.access_token) {
        throw new ServiceUnavailableException(`百川自动登录失败：${result.msg || response.status}`);
      }
      const newToken = String(result.data.access_token);
      const credential = {
        token: newToken,
        cookie: `visible=false; user-v3=${encodeURIComponent(JSON.stringify({ token: newToken }))}`,
        exp: this.jwtExp(newToken),
      };
      this.runtimeCredential = credential;
      return credential;
    })().finally(() => { this.loginInflight = undefined; });
    return this.loginInflight;
  }

  private jwtExp(token: string) {
    try { return Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).exp || 0); }
    catch { return 0; }
  }

  private accessControlCheck() {
    const key = CryptoJS.enc.Utf8.parse('BSC@%#$%');
    const iv = CryptoJS.enc.Utf8.parse('12345678');
    return CryptoJS.DES.encrypt(`date=${Date.now()}&random=${Math.ceil(Math.random() * 999999999)}`, key, {
      iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  private parse(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const table = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
    const headerIndex = table.findIndex((row) => String(row?.[0] || '').trim() === '日期');
    if (headerIndex < 0) throw new ServiceUnavailableException('百川 Excel 缺少日期表头');
    const headers = table[headerIndex];
    const dateRows = table.slice(headerIndex + 1).map((row) => ({ row, date: this.cellDate(row[0]) })).filter((item) => item.date);
    const output: Array<{ region: string; marketName: string; date: string; price: number; change: number }> = [];
    for (let column = 1; column < headers.length; column++) {
      const marketName = String(headers[column] || '').trim();
      if (!marketName) continue;
      const values = dateRows.map((item) => ({ date: item.date!, value: Number(item.row[column]) })).filter((item) => Number.isFinite(item.value) && item.value > 0);
      if (!values.length) continue;
      const latest = values[values.length - 1];
      const previous = values.length > 1 ? values[values.length - 2] : latest;
      output.push({
        region: this.region(marketName), marketName, date: latest.date,
        price: latest.value, change: Number((latest.value - previous.value).toFixed(4)),
      });
    }
    return output;
  }

  private cellDate(value: any): string | null {
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const match = String(value || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
  }

  private region(name: string) {
    const prefix = name.match(/^([一-龥]{2,5})市场/)?.[1] || '全国';
    return ['华东', '华南', '华北', '华中', '西北', '西南', '东北'].includes(prefix) ? `${prefix}地区` : prefix === '内蒙' ? '内蒙古' : prefix;
  }

  private formatDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
