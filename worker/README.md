# SubBoost Worker Lite

只依赖 Cloudflare Workers + Workers KV 的精简部署形态：聚合多个上游订阅与手动节点，生成 Clash/Mihomo 订阅链接，管理端由访问 token 保护，每 12 小时自动刷新。

设计依据：

- 实施方案（Plan）：`docs/implementation/cf-worker-lite-plan.md`
- 构建手册（Build）：`docs/implementation/cf-worker-lite-build.md`

## 本地开发

```bash
# 1. 准备本地密钥（不要提交）
cp .dev.vars.example .dev.vars
# 填入随机值：ADMIN_TOKEN、ENCRYPTION_KEY

# 2. 构建管理页（输出到 worker/dist）
npm run worker:build

# 3. 启动 Worker（默认 http://127.0.0.1:8787；端口被占用时：npm run worker:dev -- --port 8899）
npm run worker:dev

# 4. 可选：单独启动管理页 Vite 开发服务器（带 /api、/sub 代理）
npm run worker:dev:ui
```

质量门：

```bash
npm run worker:typecheck
npm run test:unit -- worker
npm run lint
```

### 本地开发注意事项

- **本地无法验证重定向相关的 SSRF 逐跳校验。** `wrangler dev` 本地模式的出站 `fetch` 会自动跟随 3xx 重定向，`redirect: "manual"` 不生效，Worker 代码看不到 302，因此 `safe-fetch.ts` 的逐跳校验与「最多 3 跳」限制在本地不会触发（指向私网的重定向会表现为运行时网络错误，而不是「目标地址不允许」）。生产 Workers 运行时按官方文档会把 3xx 响应原样返回给调用方，部署后请按下文「第 4 步：部署后验证」复核。
- **Windows 上重新构建时 `dist` 可能残留旧 `assets/*`。** 当有进程（如正在运行的 `wrangler dev`、预览工具或杀毒扫描）持有这些文件的句柄时，Node 与 Vite 的删除会被推迟（`emptyOutDir` 看似未生效，文件仍在目录中可见）。遇到残留时先停止相关进程并手动删除 `worker/dist` 再构建；部署前确认 `dist/index.html` 引用的 `assets/*` 与目录内容一致。
- 若本机设置了 `http_proxy` / `https_proxy` 环境变量，`wrangler dev` 会让 Worker 的出站请求经过该代理。

## 首次部署

### 前置条件

- Node 版本满足根 `package.json` 的 `engines`：`>=22.13.0 <23 || >=24.0.0`。
- 已在仓库根目录执行 `npm ci` 安装依赖。
- 拥有 Cloudflare 账号，并在本机完成登录：`npx wrangler login`。
- 计划选择：Free 计划每请求 CPU 约 10 ms，现场生成较大订阅可能超限，建议使用 Workers Paid 计划。正常访问走缓存，缓存主要由 Cron 与手动刷新预生成。

### 第 1 步：创建 KV namespace

```bash
npx wrangler kv namespace create SUBBOOST_KV
```

输出形如（以实际输出为准）：

```text
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{
  "kv_namespaces": [
    { "binding": "SUBBOOST_KV", "id": "0123456789abcdef0123456789abcdef" }
  ]
}
```

把 `id` 填入 `worker/wrangler.jsonc` 的 `kv_namespaces[0].id`，替换占位符 `REPLACE_WITH_KV_NAMESPACE_ID`：

```jsonc
"kv_namespaces": [{ "binding": "SUBBOOST_KV", "id": "0123456789abcdef0123456789abcdef" }],
```

不替换时 `wrangler deploy` 会报 KV namespace 不存在。

### 第 2 步：设置 Secret

```bash
cd worker
npx wrangler secret put ADMIN_TOKEN      # 管理端访问 token
npx wrangler secret put ENCRYPTION_KEY   # KV 静态加密密钥
cd ..
```

两个值都建议使用 32 位以上随机串，只保存在 Cloudflare 侧，不要写进仓库。生成方式示例：

```bash
openssl rand -base64 32
# 或
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

未设置 `ADMIN_TOKEN` 时所有管理 API 返回 503；未设置 `ENCRYPTION_KEY` 时源与订阅相关接口同样返回 503，即 fail closed。更换 `ENCRYPTION_KEY` 会导致已有密文无法解密，需要重新录入源与订阅。

### 第 3 步：构建并部署

```bash
npm run worker:deploy
```

该命令等价于 `npm run worker:build && wrangler deploy`：先把管理页构建到 `worker/dist`，再上传 Worker 与静态资源并注册 Cron。成功后 wrangler 会打印 Worker 地址，形如 `https://subboost-worker-lite.<账号子域>.workers.dev`。

### 第 4 步：部署后验证

把 `B` 换成实际地址，`T` 换成第 2 步设置的 `ADMIN_TOKEN`：

```bash
B="https://subboost-worker-lite.<账号子域>.workers.dev"
T="<ADMIN_TOKEN>"
curl -s $B/api/health                                   # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" $B/api/state   # 401
curl -s -H "Authorization: Bearer $T" $B/api/state      # 200，返回 app / sources / subscriptions / config / status
```

然后在浏览器打开 `B`，输入 `ADMIN_TOKEN` 进入管理页：添加一个源，创建订阅，复制链接，再确认订阅输出：

```bash
curl -s -D - "<订阅链接>" | head -20   # 200，头含 profile-update-interval: 12 与 cache-control: no-store，体为 YAML
```

以下两项本地无法验证，部署后必须复核：

1. **重定向逐跳 SSRF 校验**：添加 `remote` 源 `https://httpbin.org/redirect/5`，点击「立即刷新」，该源应失败且错误为「重定向次数超过上限」。若错误是节点解析失败，说明运行时自动跟随了重定向，逐跳校验未生效，请先排查再上线。
2. **Cron 触发**：Cloudflare Dashboard 中该 Worker 的 Settings / Triggers 应显示 `0 */12 * * *`；等到下一次整点触发后，`GET /api/state` 的 `status.lastTrigger` 应为 `cron`。也可在 `worker/` 目录执行 `npx wrangler tail` 实时观察触发日志。

### 更新部署

代码更新后重新执行 `npm run worker:deploy` 即可，KV 数据与 Secret 不受影响。管理页若仍显示旧版本，强制刷新浏览器缓存。

### 常见问题

- 部署报 KV namespace 不存在：`wrangler.jsonc` 的 id 仍是占位符，回到第 1 步。
- 管理页能打开但接口全部 503：Secret 未设置，回到第 2 步。
- 管理页提示 token 无效：输入值与 `ADMIN_TOKEN` 不一致，重新执行 `wrangler secret put ADMIN_TOKEN` 后再试。
- 订阅返回 503 `No nodes available`：所有源抓取失败或尚未刷新，先在管理页点「立即刷新」并查看状态面板的错误信息。
- 订阅生成慢或超限：Free 计划 CPU 限制所致，升级 Paid 或等待 Cron 预生成缓存。

## Git 集成部署（Workers Builds）

上面是默认的本地 `wrangler deploy` 方式。如果你希望推送代码后由 Cloudflare 自动构建并部署（Dashboard 里 Create → Import a repository / “Continue with GitHub”），可以连接 GitHub 仓库走 Workers Builds。

仓库已按 Workers Builds 的**默认命令**配置好，连接仓库后不需要改动任何构建设置：

1. Workers & Pages → Create → Import a repository → 选择本仓库，Production branch 填 `main`。
2. Root directory、Build command、Deploy command、Preview command 四项**全部保持默认**（`/`、留空、`npx wrangler deploy`、`npx wrangler preview`）。
3. 在 Worker 的 Settings → Variables & Secrets 添加两个 Secret 类型的变量：`ADMIN_TOKEN`、`ENCRYPTION_KEY`。
4. 推送代码即完成构建与部署。

### 为什么零配置能跑

- `wrangler.jsonc` 放在**仓库根目录**，`npx wrangler deploy` / `npx wrangler preview` 在 Root directory `/` 直接读到它；`main` 指向 `worker/src/index.ts`，`assets.directory` 指向 `worker/dist`，两个路径都相对配置文件解析。
- 根 `package.json` 的 `prepare` 脚本会在 Workers Builds 安装依赖（`npm ci`）后自动执行 `npm run worker:build`，所以 Build command 可以留空；本地手动构建用 `npm run build`。
- 非生产分支由 `npx wrangler preview` 部署，根配置里的 `previews: {}` 是这条命令的硬性要求，缺了会直接报错退出。

### 前置

- 仓库已推送到 GitHub（Workers Builds 只读你连接的那个仓库/分支）。
- `wrangler.jsonc` 的 `kv_namespaces[0].id` 是真实 KV namespace id。Workers Builds 读取仓库里的配置，不读本地 `.dev.vars`；KV namespace id 不是敏感信息，可以提交。创建：`npx wrangler kv namespace create SUBBOOST_KV`，或在 Dashboard → Storage & Databases → KV 中创建。
- Node 版本：Workers Builds 默认 Node 24.18.0，满足本仓库 `engines`（`>=24.0.0`）。如需与 CI 对齐，可在 Build 变量中设 `NODE_VERSION=22.19.0`。

### 运行时 Secret

Workers Builds 的 Build variables/secrets 只作用于构建阶段，不会注入运行时。`ADMIN_TOKEN`、`ENCRYPTION_KEY` 需在 Worker 的 Settings → Variables & Secrets 里添加为 **Secret** 类型（或部署后在仓库根执行 `npx wrangler secret put ADMIN_TOKEN`），否则管理接口按 fail closed 返回 503。

### Preview（非生产分支）构建

非 `main` 分支由 `npx wrangler preview` 部署，结果会挂到 PR 的检查项上。注意 Preview 环境**不继承**生产配置：根配置的 `previews` 块目前为空，预览实例因此没有 KV、`APP_NAME` 与 Secret，页面能打开但功能不完整。要让它可用：

- 建一个独立的预览 KV，写进 `previews.kv_namespaces`（不要指向生产 KV，避免预览分支写入生产数据）。
- `npx wrangler preview base-config secret put ADMIN_TOKEN` / `ENCRYPTION_KEY`。

不需要分支预览时，可在 Settings → Build → Branch control 关闭 Enable Preview Builds。

### 注意事项

- Cron `0 */12 * * *` 由 `wrangler.jsonc` 声明，随每次部署注册，无需额外配置。
- 每次 push 到 `main` 都会触发一次构建与部署，注意 Free 计划的构建额度与时长。
- 部署后仍按上文「第 4 步：部署后验证」复核，尤其是重定向逐跳 SSRF 校验与 Cron 触发两项。
- 本地 `npm run worker:deploy` 与 Workers Builds 部署的是同一个 Worker，两种方式可并存；同名 Worker 以后部署的为准，属正常覆盖行为。
- 本地开发：`wrangler dev` 通过 `--config ../wrangler.jsonc` 读取根配置，`.dev.vars` 因此位于**仓库根目录**，`worker/.dev.vars` 不再被读取。

## 说明

- 节点解析与 YAML 生成复用 `@subboost/core`，输出与 `local/` 应用一致。
- 生成配置为 `UserConfig` 结构的 JSON，管理页以 JSON 文本框编辑。
- Free 计划每请求 CPU 限制较紧，建议使用 Workers Paid 计划，并依赖 Cron 预生成缓存。
- v1 不支持 Surge / Loon / QuantumultX 配置行作为输入源。
