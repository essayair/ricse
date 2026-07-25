import { PartnerController } from './partner.controller';

describe('PartnerController route order', () => {
  it('车辆列表静态路由应在合作伙伴详情动态路由之前注册', () => {
    const methods = Object.getOwnPropertyNames(PartnerController.prototype);
    expect(methods.indexOf('findAllVehicles')).toBeGreaterThan(-1);
    expect(methods.indexOf('findAllVehicles')).toBeLessThan(methods.indexOf('findOne'));
  });
});

describe('PartnerController attachments', () => {
  const partnerService = {
    findAttachmentById: jest.fn(),
    renameAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
  };
  const fileService = {
    getUrl: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new PartnerController(partnerService as any, fileService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a temporary view URL for a partner attachment', async () => {
    partnerService.findAttachmentById.mockResolvedValue({ id: 'att-1', fileName: 'partner/file.pdf' });
    fileService.getUrl.mockResolvedValue('http://storage.local/file.pdf');

    await expect(controller.getAttachmentViewUrl('att-1')).resolves.toEqual({
      url: 'http://storage.local/file.pdf',
    });
    expect(fileService.getUrl).toHaveBeenCalledWith('partner/file.pdf');
  });

  it('renames an existing partner attachment', async () => {
    partnerService.findAttachmentById.mockResolvedValue({ id: 'att-1' });
    partnerService.renameAttachment.mockResolvedValue({ id: 'att-1', originalName: '新名称.pdf' });

    await expect(controller.renameAttachment('att-1', ' 新名称.pdf ')).resolves.toEqual({
      id: 'att-1',
      originalName: '新名称.pdf',
    });
    expect(partnerService.renameAttachment).toHaveBeenCalledWith('att-1', '新名称.pdf');
  });

  it('treats repeated attachment deletion as successful', async () => {
    partnerService.findAttachmentById.mockResolvedValue(null);

    await expect(controller.deleteAttachment('missing')).resolves.toBeUndefined();
    expect(fileService.delete).not.toHaveBeenCalled();
    expect(partnerService.deleteAttachment).not.toHaveBeenCalled();
  });

  it('removes the database record even if the object is already missing', async () => {
    partnerService.findAttachmentById.mockResolvedValue({ id: 'att-1', fileName: 'partner/missing.pdf' });
    fileService.delete.mockRejectedValue(new Error('missing object'));
    partnerService.deleteAttachment.mockResolvedValue({ id: 'att-1' });

    await expect(controller.deleteAttachment('att-1')).resolves.toBeUndefined();
    expect(partnerService.deleteAttachment).toHaveBeenCalledWith('att-1');
  });
});
