export type SystemDialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export type SystemDialogRequest = SystemDialogOptions & {
  kind: 'alert' | 'confirm' | 'prompt';
  message: string;
  defaultValue?: string;
  validationItems?: Array<{ key: string; message: string }>;
  resolve: (value: boolean | string | null) => void;
};

export const SYSTEM_DIALOG_EVENT = 'ricse:system-dialog';

/** 先识别失败和前置条件，不能因“必须先完成”包含“完成”而误报成功。 */
export function alertPresentation(message: string, title?: string) {
  const failed = /失败|错误|异常|无权|不能|无法|未完成|未成功|不允许|尚未|还未|未通过/.test(`${title || ''}\n${message}`);
  const incomplete = /请选择|请填写|请输入|请先|必须|至少|请.*(?:完成|上传|选择|填写)/.test(message);
  const succeeded = /成功|已完成|已保存|已提交|已发布|已取消|已删除|已更新|已确认|完成[。！!]?\s*$/.test(message);
  return {
    title: title || (failed ? '操作未完成' : incomplete ? '请完善信息' : succeeded ? '操作成功' : '系统提示'),
    destructive: failed || incomplete,
  };
}

function inferTitle(message: string, kind: 'alert' | 'confirm' | 'prompt') {
  if (kind === 'alert') return alertPresentation(message).title;
  if (/驳回/.test(message)) return '填写驳回原因';
  if (/审批意见/.test(message)) return '填写审批意见';
  if (/撤销.*原因|更换.*原因|追加原因|解除原因/.test(message)) return '填写操作原因';
  if (/附件名称/.test(message)) return '修改附件名称';
  if (/数量/.test(message) && kind === 'prompt') return '填写业务数量';
  if (/备注|说明/.test(message) && kind === 'prompt') return '填写补充说明';
  if (/删除/.test(message)) return '删除确认';
  if (/作废/.test(message)) return '作废确认';
  if (/取消/.test(message)) return '取消确认';
  if (/黑名单/.test(message)) return '加入黑名单确认';
  if (/禁用|停用/.test(message)) return '停用确认';
  if (/启用/.test(message)) return '启用确认';
  if (/审批|批准/.test(message)) return '审批确认';
  if (/发布/.test(message)) return '发布确认';
  if (/入库/.test(message)) return '入库确认';
  if (/出库|放行/.test(message)) return '出库确认';
  if (/领料/.test(message)) return '领料确认';
  if (/付款|到账/.test(message)) return '资金操作确认';
  if (/创建/.test(message)) return '创建确认';
  return kind === 'prompt' ? '填写处理信息' : '操作确认';
}

function dispatch<T extends boolean | string | null>(request: Omit<SystemDialogRequest, 'resolve'>) {
  if (typeof window === 'undefined') return Promise.resolve((request.kind === 'confirm' ? false : null) as T);
  return new Promise<T>((resolve) => {
    window.dispatchEvent(new CustomEvent<SystemDialogRequest>(SYSTEM_DIALOG_EVENT, {
      detail: { ...request, resolve: resolve as SystemDialogRequest['resolve'] },
    }));
  });
}

export function confirmAction(message: string, options: SystemDialogOptions = {}) {
  return dispatch<boolean>({
    kind: 'confirm',
    message,
    title: options.title || inferTitle(message, 'confirm'),
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    destructive: options.destructive ?? /删除|作废|取消|禁用|停用|黑名单/.test(message),
  });
}

export function promptAction(message: string, defaultValue = '', options: SystemDialogOptions = {}) {
  return dispatch<string | null>({
    kind: 'prompt',
    message,
    defaultValue,
    title: options.title || inferTitle(message, 'prompt'),
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    destructive: options.destructive,
  });
}

export function alertAction(message: string, options: SystemDialogOptions = {}) {
  const presentation = alertPresentation(message, options.title);
  return dispatch<boolean>({
    kind: 'alert',
    message,
    title: presentation.title,
    confirmText: options.confirmText || '知道了',
    destructive: options.destructive ?? presentation.destructive,
  });
}

export function alertValidationErrors(items: Array<{ key: string; message: string }>) {
  return dispatch<string | boolean | null>({
    kind: 'alert',
    message: '请检查并完善以下内容：',
    title: `有 ${items.length} 项需要完善`,
    confirmText: '知道了',
    validationItems: items,
  });
}
