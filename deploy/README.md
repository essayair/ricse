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
# MINIO_PUBLIC_USE_SSL 改为 HTTPS 配置，并设置 ENABLE_HTTPS=true

./deploy/deploy.sh --https
```

生产/测试服务器由主机 Nginx 统一接管公网 80/443 端口。RICSE 容器默认只绑定
`127.0.0.1:8080` 和 `127.0.0.1:8443`，避免覆盖同一台 ECS 上的官网及其他子域名。
云效主机发布会根据 `deploy/nginx/host-edge.conf.template` 安装
`/etc/nginx/conf.d/ricse.conf`，再启动主机 Nginx。服务器需预先安装 Nginx。
发布还会同步 `deploy/certbot` 中的续期钩子；证书续期时会临时停止主机 Nginx，
更新 RICSE 共享证书后再恢复服务。

`--seed` 只用于初始化测试数据，不应在每次发布时重复执行。

系统必需的默认审批流程由 Prisma 数据迁移初始化，云效常规发布执行
`prisma migrate deploy` 后会自动补齐，不依赖 `--seed`。迁移只补缺失流程和节点，
不会覆盖已经配置的审批人或流程状态。

## 云效 Flow

当前 ECS 可先使用“源码制品发布”，无需开通付费 ACR：

1. 构建任务执行 `./deploy/ci-verify.sh`；
2. 构建任务执行 `./deploy/ci-package-source.sh`，上传 `dist/ricse-source-*.tgz`；
3. 主机部署任务将制品下载到 `/home/admin/app`；
4. 主机部署脚本解压到 `/opt/ricse/releases/<commit>`，复制现有
   `/opt/ricse/deploy/.env.staging`；启用 HTTPS 时还会从
   `/opt/ricse/deploy/certs` 复制证书，执行该版本的
   `deploy/flow-host-deploy.sh`；
5. 检查 `/api/v1/health` 和 `/login`。

内容运营中心上线后还应检查 `/api/v1/content-health`。同一 API 镜像会分别启动
`core-api`、`content-api` 和 `content-worker`：第三方采集和批量 AI 只在 Worker 中运行，
其异常不会阻塞合同、库存等核心 API。部署前需要在云效密钥变量或服务器
`.env.staging` 配置微信、DeepSeek、百川凭据；不要把真实值提交到 Git。

部署完成后，在“内容运营中心 → 采集与 AI”手工触发一次行情同步；资讯统一在“资讯管理”中维护，旧资讯同步入口已停用；
历史行情 Excel 可在“数据源管理”的“萤石产业数据文件”上传，执行结果统一在任务列表查看。

开通 ACR 后可切换为镜像发布：

1. 流水线先登录 ACR；
2. 设置 `API_IMAGE`、`WEB_IMAGE` 后执行 `./deploy/ci-build.sh`；
3. 上传生成的 `dist/ricse-release-*.tgz`；
4. ECS 解压制品到 `/opt/ricse` 后执行 `deploy/release.sh`。

`release.sh` 会串行化发布、备份 PostgreSQL、执行 Prisma 迁移、启动服务并进行
健康检查；检查失败时会回退 API/Web 镜像，但不会自动回滚数据库迁移。
