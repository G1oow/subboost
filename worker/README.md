# SubBoost Worker Lite

只依赖 Cloudflare Workers + Workers KV 的精简部署形态：聚合多个上游订阅与手动节点，生成 Clash/Mihomo 订阅链接，管理端由访问 token 保护，每 12 小时自动刷新。

设计依据：

- 实施方案（Plan）：`docs/implementation/cf-worker-lite-plan.md`
- 构建手册（Build）：`docs/implementation/cf-worker-lite-build.md`

## 本地开发

```bash
# 1. 准备本地密钥（不要提交）
cp worker/.dev.vars.example worker/.dev.vars
# 填入随机值：ADMIN_TOKEN、ENCRYPTION_KEY

# 2. 构建管理页（输出到 worker/dist）
npm run worker:build

# 3. 启动 Worker（默认 http://127.0.0.1:8787）
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

## 首次部署

```bash
npx wrangler login
npx wrangler kv namespace create SUBBOOST_KV   # 把返回的 id 填入 worker/wrangler.jsonc
cd worker
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ENCRYPTION_KEY
cd ..
npm run worker:deploy
```

部署后用 `curl` 复核：

```bash
B="https://<你的-worker-域名>"
curl -s $B/api/health                                  # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" $B/api/state  # 401
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" $B/api/state
```

## 说明

- 节点解析与 YAML 生成复用 `@subboost/core`，输出与 `local/` 应用一致。
- 生成配置为 `UserConfig` 结构的 JSON，管理页以 JSON 文本框编辑。
- Free 计划每请求 CPU 限制较紧，建议使用 Workers Paid 计划，并依赖 Cron 预生成缓存。
- v1 不支持 Surge / Loon / QuantumultX 配置行作为输入源。
