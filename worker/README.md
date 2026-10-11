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

### 本地开发注意事项

- **本地无法验证重定向相关的 SSRF 逐跳校验。** `wrangler dev` 本地模式的出站 `fetch` 会自动跟随 3xx 重定向，`redirect: "manual"` 不生效，Worker 代码看不到 302，因此 `safe-fetch.ts` 的逐跳校验与「最多 3 跳」限制在本地不会触发（指向私网的重定向会表现为运行时网络错误，而不是「目标地址不允许」）。生产 Workers 运行时按官方文档会把 3xx 响应原样返回给调用方，部署后请按下文「部署后复核」验证。
- **Windows 上重新构建时 `dist` 可能残留旧 `assets/*`。** 当有进程（如正在运行的 `wrangler dev`、预览工具或杀毒扫描）持有这些文件的句柄时，Node 与 Vite 的删除会被推迟（`emptyOutDir` 看似未生效，文件仍在目录中可见）。遇到残留时先停止相关进程并手动删除 `worker/dist` 再构建；部署前确认 `dist/index.html` 引用的 `assets/*` 与目录内容一致。
- 若本机设置了 `http_proxy` / `https_proxy` 环境变量，`wrangler dev` 会让 Worker 的出站请求经过该代理。

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

部署后还应复核本地无法验证的重定向逐跳校验：添加一个 `remote` 源 `https://httpbin.org/redirect/5`，手动刷新后该源应失败且错误为「重定向次数超过上限」；若错误是节点解析失败，说明运行时自动跟随了重定向，逐跳校验未生效。

## 说明

- 节点解析与 YAML 生成复用 `@subboost/core`，输出与 `local/` 应用一致。
- 生成配置为 `UserConfig` 结构的 JSON，管理页以 JSON 文本框编辑。
- Free 计划每请求 CPU 限制较紧，建议使用 Workers Paid 计划，并依赖 Cron 预生成缓存。
- v1 不支持 Surge / Loon / QuantumultX 配置行作为输入源。
