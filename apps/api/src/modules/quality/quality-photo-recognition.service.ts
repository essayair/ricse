import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface QualityPhotoRecognitionFields {
  sampleLabel?: string;
  sealNo?: string;
  samplerName?: string;
  samplingMethod?: string;
  destinationInstitutionName?: string;
}

export interface QualityPhotoRecognitionResult {
  available: boolean;
  success: boolean;
  provider: 'BAIDU_OCR' | 'NONE';
  rawText: string;
  fields: QualityPhotoRecognitionFields;
  message: string;
}

@Injectable()
export class QualityPhotoRecognitionService {
  private readonly logger = new Logger(QualityPhotoRecognitionService.name);
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  async recognize(buffer: Buffer): Promise<QualityPhotoRecognitionResult> {
    const apiKey = this.config.get<string>('BAIDU_OCR_API_KEY')?.trim();
    const secretKey = this.config.get<string>('BAIDU_OCR_SECRET_KEY')?.trim();
    if (!apiKey || !secretKey) {
      return {
        available: false,
        success: false,
        provider: 'NONE',
        rawText: '',
        fields: {},
        message: '样品照片已选取；OCR 服务尚未配置，请手工核对样品信息',
      };
    }

    try {
      const token = await this.getAccessToken(apiKey, secretKey);
      const form = new URLSearchParams();
      form.set('image', buffer.toString('base64'));
      form.set('detect_direction', 'true');
      form.set('paragraph', 'true');
      form.set('probability', 'true');
      const response = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || body.error_code) {
        throw new Error(`HTTP ${response.status} ${body.error_msg || body.error_code || ''}`.trim());
      }
      const rawText = (body.words_result || [])
        .map((item: { words?: string }) => String(item.words || '').trim())
        .filter(Boolean)
        .join('\n');
      const fields = this.extractFields(rawText);
      return {
        available: true,
        success: Boolean(rawText),
        provider: 'BAIDU_OCR',
        rawText,
        fields,
        message: rawText
          ? (Object.keys(fields).length ? '已识别样品标签信息，请核对后使用' : '已识别照片文字，未找到明确字段，请手工核对')
          : '未识别到清晰文字，请手工填写样品信息',
      };
    } catch (error) {
      this.logger.warn(`样品照片 OCR 识别失败: ${error instanceof Error ? error.message : String(error)}`);
      return {
        available: true,
        success: false,
        provider: 'BAIDU_OCR',
        rawText: '',
        fields: {},
        message: '照片识别暂时不可用，照片仍可正常保存，请手工核对信息',
      };
    }
  }

  private async getAccessToken(apiKey: string, secretKey: string) {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const form = new URLSearchParams();
    form.set('grant_type', 'client_credentials');
    form.set('client_id', apiKey);
    form.set('client_secret', secretKey);
    const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
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

  private extractFields(rawText: string): QualityPhotoRecognitionFields {
    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const pick = (labels: string[], maxLength: number) => {
      for (const line of lines) {
        for (const label of labels) {
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = line.match(new RegExp(`(?:^|\\s)${escaped}\\s*[:：#＃]?\\s*(.+)$`, 'i'));
          if (match?.[1]?.trim()) return match[1].trim().slice(0, maxLength);
        }
      }
      return undefined;
    };
    return this.removeEmpty({
      sampleLabel: pick(['样品标签', '标签', '样品名称'], 100),
      sealNo: pick(['封签编号', '封签号', '封条编号', '封条号'], 100),
      samplerName: pick(['取样人', '采样人'], 100),
      samplingMethod: pick(['取样方法', '采样方法'], 200),
      destinationInstitutionName: pick(['送检机构', '检测机构', '检验机构'], 200),
    });
  }

  private removeEmpty(fields: QualityPhotoRecognitionFields) {
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => Boolean(value))) as QualityPhotoRecognitionFields;
  }
}
