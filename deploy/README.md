# RICSE 测试环境部署

该目录用于将 RICSE 以 Docker Compose 方式部署到单台 ECS。

完整说明见：[`docs/技术/阿里云测试环境部署.md`](../docs/技术/阿里云测试环境部署.md)。

首次部署的最短流程：

```bash
cp deploy/.env.staging.example deploy/.env.staging
# 编辑 deploy/.env.staging，替换全部 CHANGE_ME 和访问地址

chmod +x deploy/deploy.sh
./deploy/deploy.sh --seed
```

配置域名和证书后：

```bash
mkdir -p deploy/certs
# 放入 deploy/certs/fullchain.pem 和 deploy/certs/privkey.pem
# 同时把 .env.staging 中的 PUBLIC_URL、MINIO_PUBLIC_PORT、
# MINIO_PUBLIC_USE_SSL 改为 HTTPS 配置

./deploy/deploy.sh --https
```

`--seed` 只用于初始化测试数据，不应在每次发布时重复执行。
