import { BadRequestException } from '@nestjs/common';
import { ContractService } from './contract.service';

describe('合同附件锁定', () => {
  const service = Object.create(ContractService.prototype) as ContractService;

  it('草稿和已驳回合同可以修改附件', () => {
    expect(() => service.assertAttachmentsEditable('DRAFT')).not.toThrow();
    expect(() => service.assertAttachmentsEditable('REJECTED')).not.toThrow();
  });

  it('审批中、已生效、执行中、已完成、已作废合同的附件不能再上传、删除或修改', () => {
    for (const status of ['PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'VOIDED', undefined, null]) {
      expect(() => service.assertAttachmentsEditable(status)).toThrow(BadRequestException);
    }
  });
});
