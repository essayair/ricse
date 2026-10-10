import { ConfigService } from '@nestjs/config';
import { PaymentVoucherRecognitionService } from './payment-voucher-recognition.service';

describe('PaymentVoucherRecognitionService', () => {
  const service = new PaymentVoucherRecognitionService({ get: () => undefined } as unknown as ConfigService);

  it('extracts the core fields from a bank receipt', () => {
    const result = service.extractFields([
      '电子回单号：12609084020226379820260908',
      '付款户名：浙江嘉溢货立方科技服务有限公司',
      '付款账号：8602 1110 0016 5054 9',
      '付款开户行：衢州龙游支行营业部',
      '收款户名：李加强',
      '收款账号：6212 2612 0206 1997 921',
      '收款开户行：中国工商银行总行清算中心',
      '交易金额：3,408.90',
      '交易币种：人民币',
      '付款用途：费用报销',
      '提交日期：2026-09-08 15:07:54',
    ].join('\n'));

    expect(result).toMatchObject({
      receiptNo: '12609084020226379820260908',
      payerName: '浙江嘉溢货立方科技服务有限公司',
      payerAccount: '86021110001650549',
      payerBankName: '衢州龙游支行营业部',
      payeeName: '李加强',
      payeeAccount: '6212261202061997921',
      payeeBankName: '中国工商银行总行清算中心',
      amount: 3408.9,
      currency: 'CNY',
      occurredAt: '2026-09-08T15:07:54+08:00',
      purpose: '费用报销',
    });
  });

  it('falls back to manual entry when OCR credentials are absent', async () => {
    await expect(service.recognize(Buffer.from('receipt'), 'image/png')).resolves.toMatchObject({
      available: false,
      success: false,
      provider: 'NONE',
    });
  });
});
