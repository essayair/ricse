import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CircleUserRound, ShieldCheck, Tags, Users } from 'lucide-react';

const PLANNED_AREAS = [
  {
    icon: CircleUserRound,
    title: '用户档案',
    description: '统一查看来自官网、小程序及未来平台服务的个人用户。',
  },
  {
    icon: ShieldCheck,
    title: '账号与身份',
    description: '规划登录身份、手机号、第三方账号绑定及账号状态管理。',
  },
  {
    icon: Tags,
    title: '用户运营',
    description: '规划标签、分群、活跃度和用户服务记录等运营能力。',
  },
];

export default function UserManagementPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">用户管理中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            面向官网、小程序及未来产业链平台的个人用户统一管理入口
          </p>
        </div>
        <Badge variant="secondary">功能规划中</Badge>
      </div>

      <Card className="border-dashed p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">个人用户管理</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          当前先建立一级模块和页面入口，暂不接入用户数据，也不提前固化数据模型、业务流程和权限规则。
          具体方案确认后再分阶段开发。
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANNED_AREAS.map((area) => {
          const Icon = area.icon;
          return (
            <Card key={area.title} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <Badge variant="outline">待讨论</Badge>
              </div>
              <h3 className="mt-4 font-semibold">{area.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{area.description}</p>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">当前边界</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          本模块管理平台外部个人用户；内部员工及其登录账号仍在“组织数据”中维护，二者暂不合并。
          当前占位页面仅系统管理员可见，后续将在产品方案中单独确定运营角色、权限和数据范围。
        </p>
      </Card>
    </div>
  );
}
