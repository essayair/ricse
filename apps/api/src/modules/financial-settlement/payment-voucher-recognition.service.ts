import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaymentVoucherFields {
  receiptNo?: string;
  payerName?: string;
  payerAccount?: string;
  payerBankName?: string;
  payeeName?: string;
  payeeAccount?: string;
  payeeBankName?: string;
  amount?: number;
  currency?: string;
  occurredAt?: string;
  purpose?: string;
}

export interface PaymentVoucherRecognitionResult {
  available: boolean;
  success: boolean;
  provider: 'BAIDU_OCR' | 'NONE';
  rawText: string;
  fields: PaymentVoucherFields;
  message: string;
}

@Injectable()
export class PaymentVoucherRecognitionService {
  private readonly logger = new Logger(PaymentVoucherRecognitionService.name);
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  async recognize(buffer: Buffer, mimeType: string): Promise<PaymentVoucherRecognitionResult> {
    const apiKey = this.config.get<string>('BAIDU_OCR_API_KEY')?.trim();
    const secretKey = this.config.get<string>('BAIDU_OCR_SECRET_KEY')?.trim();
    if (!apiKey || !secretKey) {
      return {
        available: false, success: false, provider: 'NONE', rawText: '', fields: {},
        message: '付款凭证已选取；OCR 服务尚未配置，请手工填写并核对凭证信息',
      };
    }
    try {
      const token = await this.getAccessToken(apiKey, secretKey);
      const form = new URLSearchParams();
      form.set(mimeType === 'application/pdf' ? 'pdf_file' : 'image', buffer.toString('base64'));
      form.set('detect_direction', 'true');
      form.set('paragraph', 'false');
      form.set('probability', 'true');
      if (mimeType === 'application/pdf') form.set('pdf_file_num', '1');
      const response = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(25_000),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || body.error_code) throw new Error(`HTTP ${response.status} ${body.error_msg || body.error_code || ''}`.trim());
      const rawText = (body.words_result || [])
        .map((item: { words?: string }) => String(item.words || '').trim())
        .filter(Boolean)
        .join('\n');
      const fields = this.extractFields(rawText);
      return {
        available: true, success: Boolean(rawText), provider: 'BAIDU_OCR', rawText, fields,
        message: rawText
          ? (Object.keys(fields).length ? '已识别付款凭证核心信息，请逐项核对后创建付款单' : '已读取凭证文字，但未提取到明确字段，请手工填写')
          : '未识别到清晰文字，请手工填写付款凭证信息',
      };
    } catch (error) {
      this.logger.warn(`付款凭证 OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`);
      return {
        available: true, success: false, provider: 'BAIDU_OCR', rawText: '', fields: {},
        message: '付款凭证识别暂时不可用，仍可手工填写后创建付款单',
      };
    }
  }

  extractFields(rawText: string): PaymentVoucherFields {
    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const cleanValue = (value?: string) => value?.replace(/^[：:\s]+/, '').trim() || undefined;
    const valueAfter = (labels: string[], maxLength = 200) => {
      for (let index = 0; index < lines.length; index += 1) {
        for (const label of labels) {
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const inline = lines[index].match(new RegExp(`${escaped}\\s*[:：]?\\s*(.+)$`, 'i'));
          if (inline?.[1] && inline[1].trim() !== label) return cleanValue(inline[1])?.slice(0, maxLength);
          if (new RegExp(`^${escaped}\\s*[:：]?$`, 'i').test(lines[index])) {
            const next = lines.slice(index + 1, index + 4).find(value => value && !labels.includes(value));
            if (next) return cleanValue(next)?.slice(0, maxLength);
          }
        }
      }
      return undefined;
    };
    const normalizeAccount = (value?: string) => value?.replace(/[^0-9A-Za-z]/g, '') || undefined;
    const parseAmount = (value?: string) => {
      if (!value) return undefined;
      const number = Number(value.replace(/[￥¥,，\s人民币元]/g, '').match(/-?\d+(?:\.\d{1,2})?/)?.[0]);
      return Number.isFinite(number) && number > 0 ? number : undefined;
    };
    const normalizeDateTime = (value?: string) => {
      if (!value) return undefined;
      const match = value.match(/(20\d{2})[-年/.]?(\d{1,2})[-月/.]?(\d{1,2})日?\s*(\d{1,2})?[:时]?(\d{1,2})?[:分]?(\d{1,2})?/);
      if (!match) return undefined;
      const [, year, month, day, hour = '12', minute = '00', second = '00'] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}+08:00`;
    };
    const accountCandidates = lines
      .map(line => normalizeAccount(line))
      .filter((value): value is string => Boolean(value && /^\d{8,25}$/.test(value)));
    const names = lines.filter(line => /(?:公司|厂|中心|合作社)$/.test(line) || /^[\u4e00-\u9fa5·]{2,5}$/.test(line));
    const banks = lines.filter(line => /(?:银行|支行|营业部|清算中心)$/.test(line));
    const receiptNo = normalizeAccount(valueAfter(['电子回单号', '回单编号', '回单号码', '交易流水号', '银行流水号'], 80));
    const explicitAmount = valueAfter(['交易金额', '金额（小写）', '金额(小写)', '付款金额'], 80);
    const payerAccount = normalizeAccount(valueAfter(['付款账号', '付款人账号', '付款方账号'], 80)) || accountCandidates.find(value => value !== receiptNo);
    const payeeAccount = normalizeAccount(valueAfter(['收款账号', '收款人账号', '收款方账号'], 80))
      || accountCandidates.find(value => value !== receiptNo && value !== payerAccount);
    const currencyText = valueAfter(['交易币种', '币种'], 30);
    return this.removeEmpty({
      receiptNo,
      payerName: valueAfter(['付款户名', '付款人户名', '付款方户名'], 200) || names[0],
      payerAccount,
      payerBankName: valueAfter(['付款开户行', '付款人开户银行', '付款方开户行'], 200) || banks[0],
      payeeName: valueAfter(['收款户名', '收款人户名', '收款方户名'], 200) || names.find(name => name !== names[0]),
      payeeAccount,
      payeeBankName: valueAfter(['收款开户行', '收款人开户银行', '收款方开户行'], 200) || banks.find(bank => bank !== banks[0]),
      amount: parseAmount(explicitAmount),
      currency: currencyText?.includes('美元') || currencyText?.toUpperCase().includes('USD') ? 'USD' : currencyText ? 'CNY' : undefined,
      occurredAt: normalizeDateTime(valueAfter(['交易时间', '提交日期', '付款时间', '交易日期'], 80)),
      purpose: valueAfter(['付款用途', '附言', '用途'], 300),
    });
  }

  private removeEmpty(fields: PaymentVoucherFields) {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== '')) as PaymentVoucherFields;
  }

  private async getAccessToken(apiKey: string, secretKey: string) {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const form = new URLSearchParams();
    form.set('grant_type', 'client_credentials');
    form.set('client_id', apiKey);
    form.set('client_secret', secretKey);
    const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error(`获取 OCR 令牌失败（HTTP ${response.status}）`);
    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(300, Number(body.expires_in || 2_592_000) - 120) * 1000,
    };
    return this.accessToken.value;
  }
}
