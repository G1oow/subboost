<!-- markdownlint-disable MD033 MD041 -->
<div align="center">
  <p><img src="docs/assets/logo.png" alt="SubBoost Worker Lite" width="96"></p>
  <h1>SubBoost Worker Lite</h1>
  <p>Cloudflare Workers + Workers KV 上的 Clash/Mihomo 订阅聚合与管理</p>
  <p>
    <img src="https://img.shields.io/badge/platform-Cloudflare%20Workers%20%2B%20KV-orange.svg" alt="Platform: Cloudflare Workers + KV">
    <img src="https://img.shields.io/badge/version-0.1.0-green.svg" alt="Version 0.1.0">
    <img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License AGPL-3.0-only">
  </p>
</div>
<!-- markdownlint-enable MD033 MD041 -->

**SubBoost Worker Lite** 是 [SubBoost](https://github.com/SubBoost/subboost) 的精简部署形态：把几个上游订阅与手动节点聚合成一条 Clash/Mihomo 订阅链接，只依赖 Cloudflare Workers 与 Workers KV，不需要服务器、数据库或容器。适合个人使用、只想维护一条聚合链接的场景。

## 特性

- **订阅聚合**：导入多个上游订阅与手动节点（`ss://`、`vmess://`、`vless://`、`trojan://`、`hysteria2://` 等常见协议），跨源去重后生成一条订阅链接
- **管理端**：token 门保护的 SPA（源管理、订阅管理、刷新状态、生成配置 JSON 编辑），浅色/深色主题
- **自动刷新**：Cron 每 12 小时抓取上游并预生成缓存，正常访问直接命中缓存
- **静态加密**：订阅 token 等敏感数据以 AES-256-GCM 静态加密存入 KV（HKDF-SHA256 派生密钥）
- **SSRF 防护**：协议/凭据校验、私网网段黑名单、重定向逐跳校验（最多 3 跳）
- **扩展脚本分享**：导入 Clash Verge Rev 扩展脚本（`main(config)` JS），生成公开分享链接，其他设备可直接拉取导入
- **防泄漏**：全响应 `no-store`，错误与状态脱敏，订阅 token 可随时轮换

## 仓库结构

```
worker/       Cloudflare Worker（后端 API + 管理端 SPA + 部署配置）
packages/     共享包：core（解析/生成）、server-core（响应头与 UA）、ui（组件与主题）
docs/         实施文档（Plan/Build）与贡献指南
test/         回归测试与测试基础设施
```

## 快速开始

前置：Node 24.22.1+ 与 npm（版本见 `.nvmrc`，`nvm use` 可直接切换），本地运行不需要 Cloudflare 账号。

```bash
npm ci

# 1. 准备本地密钥（不要提交）
cp .dev.vars.example .dev.vars   # 填入随机 ADMIN_TOKEN、ENCRYPTION_KEY

# 2. 构建管理页
npm run worker:build

# 3. 启动（默认 http://127.0.0.1:8787）
npm run worker:dev
```

部署到 Cloudflare（创建 KV namespace、设置 secret、`wrangler deploy` 与部署后验证）见 **[worker/README.md](worker/README.md)**；同一文档也说明了通过 Cloudflare Workers Builds 连接 GitHub 自动部署的方式。

## 常用命令

```bash
npm run worker:dev          # 本地运行 Worker
npm run worker:build        # 构建管理页到 worker/dist
npm run worker:deploy       # 构建并部署到 Cloudflare
npm run worker:typecheck    # 类型检查
npm run lint                # ESLint + UI 一致性检查
npm run test:unit           # 全量单元/回归测试
npm run test:coverage       # 带覆盖率阈值的质量门
```

## 文档

- 部署与运维手册：[worker/README.md](worker/README.md)
- 实施方案（Plan）：[docs/implementation/cf-worker-lite-plan.md](docs/implementation/cf-worker-lite-plan.md)
- 构建手册（Build，含冲突与验收记录）：[docs/implementation/cf-worker-lite-build.md](docs/implementation/cf-worker-lite-build.md)
- 贡献指南：[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## 与上游 SubBoost 的关系

本仓库派生自 [SubBoost/subboost](https://github.com/SubBoost/subboost)，只保留 Cloudflare Workers 精简形态所需的代码与测试；上游的 Next.js + PostgreSQL 自托管形态（`local/`）、Docker 发布管线等不在本仓库范围内。共享包（`packages/`）沿用上游实现，但只保留 Workers 形态实际引用到的模块，其余旧前端与 Node 服务端残留已移除。

## 许可证

[GNU Affero General Public License v3.0 only](./LICENSE)。

如果你修改本仓库并向网络用户提供服务，AGPL-3.0 要求你向这些用户提供对应的源代码。

## 免责声明

本项目不提供任何代理服务，不对第三方订阅内容的可用性与合法性作任何保证。
