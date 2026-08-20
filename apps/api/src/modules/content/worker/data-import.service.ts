import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { FileService } from '../../common/file.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ContentDataImportService {
  constructor(private readonly prisma: PrismaService, private readonly files: FileService) {}

  async importPriceFile(assetId: string) {
    const asset = await this.prisma.contentAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new BadRequestException('导入文件不存在');
    const workbook = XLSX.read(await this.files.download(asset.objectKey), { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new BadRequestException('导入文件没有数据');
    let saved = 0;
    const errors: string[] = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      try {
        const rawData = JSON.parse(JSON.stringify(row)) as Prisma.InputJsonObject;
        const code = String(this.value(row, '产品编码', 'productTypeCode') || 'IMPORTED').trim().toUpperCase();
        const name = String(this.value(row, '产品名称', 'productName') || '导入行情').trim();
        const region = String(this.value(row, '地区', 'region')).trim();
        const marketName = String(this.value(row, '市场名称', 'marketName') || region).trim();
        const date = this.date(this.value(row, '业务日期', '日期', 'businessDate'));
        const price = Number(this.value(row, '价格', 'price'));
        if (!region || !marketName || !date || !Number.isFinite(price)) throw new Error('业务日期、地区、市场名称和价格为必填');
        const product = await this.prisma.contentProductType.upsert({
          where: { code },
          update: { name, status: 'ACTIVE' },
          create: { code, name, spec: String(this.value(row, '规格', 'spec') || '') || null, unit: String(this.value(row, '单位', 'unit') || '元/吨') },
        });
        await this.prisma.contentProductPrice.upsert({
          where: { productTypeId_businessDate_region_source_marketName: { productTypeId: product.id, businessDate: date, region, source: 'IMPORT', marketName } },
          update: { price: new Prisma.Decimal(price), changeAmount: this.decimal(this.value(row, '涨跌', 'changeAmount')), remark: String(this.value(row, '备注', 'remark') || '') || null, rawData },
          create: { productTypeId: product.id, businessDate: date, region, marketName, spec: String(this.value(row, '规格', 'spec') || '') || null, price: new Prisma.Decimal(price), unit: String(this.value(row, '单位', 'unit') || product.unit), changeAmount: this.decimal(this.value(row, '涨跌', 'changeAmount')), source: 'IMPORT', remark: String(this.value(row, '备注', 'remark') || '') || null, rawData },
        });
        saved++;
      } catch (error) {
        errors.push(`第 ${index + 2} 行：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!saved) throw new BadRequestException(errors.slice(0, 10).join('；'));
    return { total: rows.length, saved, failed: errors.length, errors: errors.slice(0, 50) };
  }

  private value(row: Record<string, any>, ...keys: string[]) {
    for (const key of keys) if (row[key] !== undefined && row[key] !== '') return row[key];
    return undefined;
  }

  private date(value: any) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  private decimal(value: any) {
    const number = Number(value);
    return Number.isFinite(number) ? new Prisma.Decimal(number) : null;
  }
}
