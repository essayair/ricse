import type { INestApplication } from '@nestjs/common';
import { json, type Request, type Response, type NextFunction } from 'express';

export function configureContentHttp(app: INestApplication) {
  app.getHttpAdapter().getInstance().set('trust proxy', process.env.CONTENT_TRUST_PROXY || process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
  // 授权码不按字符数猜测微信协议；保留与 Nest 默认一致的100KB请求体防护。
  const wechatPrefix = '/api/v1/public/wechat';
  app.use(wechatPrefix, (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(wechatPrefix, json({ limit: '100kb', strict: true }));
  app.use(wechatPrefix, (error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === 'entity.too.large') { res.status(413).json({ statusCode: 413, message: '登录请求内容过大，请关闭小程序后重新进入' }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ statusCode: 400, message: '登录请求格式不正确，请重新发起登录' }); return; }
    next(error);
  });
  const prefix = '/api/v1/public/content/contacts';
  app.use(prefix, (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ statusCode: 415, message: '请使用网页表单提交合作意向' }); return;
    }
    next();
  });
  // 在Nest默认解析器之前限制匿名表单；不影响后台大附件上传。
  app.use(prefix, json({ limit: '24kb', strict: true }));
  app.use(prefix, (error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === 'entity.too.large') { res.status(413).json({ statusCode: 413, message: '提交内容过长，请精简后重试' }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ statusCode: 400, message: '提交格式有误，请刷新表单后重试' }); return; }
    next(error);
  });
  // Nest ExpressAdapter 只按中间件名检测 jsonParser，不检查挂载路径。
  // 上面的局部 jsonParser 会令 Nest 跳过全局默认解析器，必须显式补齐全局解析。
  // 放在局部限制之后，合作意向仍受24KB限制；其他JSON接口沿用100KB默认值。
  app.use(json({ limit: '100kb', strict: true }));
}
