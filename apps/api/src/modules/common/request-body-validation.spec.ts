import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateDepartmentDto, CreateEmployeeDto } from '../org/dto/org.dto';
import { CreatePartnerDto, UpdatePartnerDto } from '../master-data/dto/partner.dto';
import { CreateMaterialCategoryDto, CreateWarehouseDto } from '../master-data/dto/master-data.dto';
import { UpdateServiceOrganizationDto } from '../master-data/dto/service-organization.dto';
import { CreateRoleDto, ReplaceUserAssignmentsDto } from '../access-control/dto/access-control.dto';
import { UpdateContractDto } from '../contract/dto/update-contract.dto';
import { UpdateWeighTicketInfoDto } from '../weighbridge/dto/update-weigh-ticket.dto';

// 与 main.ts 保持一致的全局校验配置
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (metatype: ArgumentMetadata['metatype'], value: unknown) => pipe.transform(value, { type: 'body', metatype });
const messagesOf = async (promise: Promise<unknown>) => {
  try { await promise; return []; } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
};

describe('原内联类型请求体改为 DTO 后的校验', () => {
  it('部门更新不能修改所属企业或主键', async () => {
    const messages = await messagesOf(validate(UpdateDepartmentDto, { name: '研发部', companyId: 'other', id: 'hijacked' }));
    expect(messages).toEqual(expect.arrayContaining(['property companyId should not exist', 'property id should not exist']));
    await expect(validate(UpdateDepartmentDto, { name: '研发部' })).resolves.toEqual({ name: '研发部' });
  });

  it('合作伙伴编辑不能修改编码、税号和内部企业标识，允许 null 清空与注册登记号', async () => {
    const messages = await messagesOf(validate(UpdatePartnerDto, { code: '999999', taxId: 'x', isInternal: true }));
    expect(messages).toHaveLength(3);
    await expect(validate(UpdatePartnerDto, { name: '甲公司', regNo: null, creditLimit: null, roles: ['SUPPLIER'] })).resolves.toBeDefined();
  });

  it('合作伙伴创建必须有名称和至少一个角色，数值字段类型错误时返回 400', async () => {
    expect(await messagesOf(validate(CreatePartnerDto, {}))).toEqual(expect.arrayContaining(['name must be a string']));
    expect(await messagesOf(validate(CreatePartnerDto, { name: '甲', roles: [] }))).toHaveLength(1);
    expect(await messagesOf(validate(CreatePartnerDto, { name: '甲', roles: ['SUPPLIER'], regCapital: 'abc' }))).toHaveLength(1);
  });

  it('此前直达数据库导致 500 的缺字段、类型错误请求改为 400', async () => {
    expect(await messagesOf(validate(CreateMaterialCategoryDto, { name: 123 }))).toHaveLength(1);
    expect(await messagesOf(validate(CreateWarehouseDto, {}))).toHaveLength(2);
    expect(await messagesOf(validate(CreateRoleDto, {}))).toHaveLength(2);
    expect(await messagesOf(validate(CreateEmployeeDto, { name: '张三' }))).toHaveLength(3);
  });

  it('用户授权的嵌套角色分配逐项校验', async () => {
    const messages = await messagesOf(validate(ReplaceUserAssignmentsDto, { assignments: [{ roleId: 'r1' }] }));
    expect(messages).toEqual(['assignments.0.scopeType must be a string']);
  });

  it('服务机构编辑回传接口返回的 id、时间戳等字段会被拒绝', async () => {
    const messages = await messagesOf(validate(UpdateServiceOrganizationDto, { id: 'x', createdAt: '2026-01-01', status: 'ACTIVE' }));
    expect(messages).toEqual(expect.arrayContaining(['property id should not exist', 'property createdAt should not exist']));
    await expect(validate(UpdateServiceOrganizationDto, { status: 'ACTIVE' })).resolves.toEqual({ status: 'ACTIVE' });
  });

  it('合同编辑沿用前端草稿保存的字段，日期可为 null，明细逐行校验', async () => {
    await expect(validate(UpdateContractDto, {
      title: '', type: 'PURCHASE', sellerId: null, effectiveAt: null, expireAt: null, signedAt: '2026-10-29',
      draftData: { form: {}, lineItems: [] }, totalAmount: 0,
      lineItems: [{ materialId: 'm1', quantity: 10, unit: 'TON', unitPrice: 100, qualityRulesSnapshot: { rules: [] } }],
    })).resolves.toBeDefined();
    expect(await messagesOf(validate(UpdateContractDto, { lineItems: [{ materialId: 'm1', quantity: -1, unitPrice: 1 }] }))).toHaveLength(1);
    expect(await messagesOf(validate(UpdateContractDto, { status: 'APPROVED' }))).toEqual(['property status should not exist']);
  });

  it('磅单基本信息件数必须为数字', async () => {
    const base = { ticketDate: '2026-10-29', plateNo: '浙A1', materialName: '萤石', materialSpec: '', shipperName: '甲', receiverName: '乙', driverName: '丙', weighmasterName: '丁' };
    await expect(validate(UpdateWeighTicketInfoDto, { ...base, packageCount: 0 })).resolves.toBeDefined();
    const messages = await messagesOf(validate(UpdateWeighTicketInfoDto, { ...base, packageCount: null }));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => message.startsWith('packageCount'))).toBe(true);
  });
});
