import type { INestApplication } from '@nestjs/common';
import { json, type Request, type Response, type NextFunction } from 'express';

export function configureContentHttp(app: INestApplication) {
  app.getHttpAdapter().getInstance().set('trust proxy', process.env.CONTENT_TRUST_PROXY || process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
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
}
