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

## 云效 Flow

当前 ECS 可先使用“源码制品发布”，无需开通付费 ACR：

1. 构建任务执行 `./deploy/ci-verify.sh`；
2. 构建任务执行 `./deploy/ci-package-source.sh`，上传 `dist/ricse-source-*.tgz`；
3. 主机部署任务将制品下载到 `/home/admin/app`；
4. 主机部署脚本解压到 `/opt/ricse/releases/<commit>`，复制现有
   `/opt/ricse/deploy/.env.staging`，执行该版本的
   `deploy/flow-host-deploy.sh`；
5. 检查 `/api/v1/health` 和 `/login`。

开通 ACR 后可切换为镜像发布：

1. 流水线先登录 ACR；
2. 设置 `API_IMAGE`、`WEB_IMAGE` 后执行 `./deploy/ci-build.sh`；
3. 上传生成的 `dist/ricse-release-*.tgz`；
4. ECS 解压制品到 `/opt/ricse` 后执行 `deploy/release.sh`。

`release.sh` 会串行化发布、备份 PostgreSQL、执行 Prisma 迁移、启动服务并进行
健康检查；检查失败时会回退 API/Web 镜像，但不会自动回滚数据库迁移。
