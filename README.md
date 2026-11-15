# 买家秀智能体 · Buyer Show Agent

给电商店铺运营用的**买家秀图文草稿生成工具**：上传一个商品的素材，批量生成不同场景的实拍感图片和多语言评论草稿，出结果前先做一遍合规自检。

> 定位是“运营草稿”，不是自动发布工具。生成的图文用不用、怎么改，都由运营最终把关。

## 它解决什么问题

护肤、美妆类商品的评论区经常缺素材：自己拍质地图、场景图效率低，手写评论又容易写成广告腔，还要顾及功效表达和平台风控。这个工具把“拍图 + 写评论 + 自查风险”合成一条流程，一次得到多套可挑选的草稿。

## 使用流程

```
上传素材 → 商品信息（手填或 AI 补全）→ 配置 A / B / C 套件 → 异步生成 → 合规自检 → 复制 / 下载 / 单张重生成
```

1. **上传素材**：分区上传产品图、包装图、质地图。多张图用来帮助 AI 理解同一个商品。
2. **商品信息**：可手填名称、功效、肤质、使用感、卖点、避免表达；不填时由 AI 根据素材补全一版。来源会标记为 `manual` / `ai_inferred` / `mixed`，手填优先。
3. **配置套件**：可建多个套件，每个套件独立选择“只要评论”或“X 张图 + 1 条评论”，并选图片类型：
   - 质地上手图
   - 浴室 / 化妆台场景图
   - 真人自拍持产品图
4. **生成与自检**：后台异步生成，可随时取消；评论生成后检查敏感词、功效夸大和平台风险，给出原因和改写建议（只提示、不拦截）。
5. **结果页**：复制、打包下载、单张图重生成、评论重生成；历史记录按账号隔离保存。

## 设计要点

- **真实感提示词**：少用棚拍类词汇，多用手机随手拍的质感描述，让图片不像广告片。完整方法见 [`docs/买家秀真实感提示词方案.md`](docs/买家秀真实感提示词方案.md)。
- **逻辑一致性**：生成前校验季节与穿着、人物动作是否雷同等常识问题，避免“夏天穿羽绒服”“每张都歪头贴脸”。
- **去 AI 味评论**：参考 [blader/humanizer](https://github.com/blader/humanizer) 的思路整理规则（`lib/buyer-show/humanizer-rules.ts`），支持简体中文、英语、泰语、马来语。
- **稳定出图**：图片渠道带重试，连续失败后自动切换到备用渠道；并发数有上限，部分失败时其余结果照常返回。
- **素材直传**：商品图通过 Cloudflare R2 预签名地址直传，不再把大图以 base64 塞进请求，避免模型超时。

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript
- Prisma 7 + PostgreSQL（历史记录、生成任务）
- Cloudflare R2（S3 兼容，预签名上传）
- zod 校验，`node --test` 测试

## 目录结构

```
app/
  buyer-show/                 主界面（BuyerShowAgentClient.tsx）
  api/buyer-show/
    assets/sign-upload/       获取 R2 预签名上传地址
    generate/                 创建生成任务；[jobId] 查询、cancel 取消
    regenerate-image/         单张图重生成
    regenerate-comment/       评论重生成
    compliance-check/         合规自检
    history/                  历史记录
lib/buyer-show/               生成服务、任务存储、模型适配、提示词规则、R2、鉴权
prisma/                       数据模型与迁移
docs/                         提示词方案、设计与实施计划
Prd.md                        产品需求文档
```

## 本地运行

需要 Node.js 22 和一个 PostgreSQL 数据库。

```bash
cp .env.example .env      # 填入数据库、模型和 R2 配置
npm install
npm run db:migrate        # 或 npm run db:push
npm run dev
```

打开 <http://localhost:3000/buyer-show>。

主要环境变量（完整列表见 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `BUYER_SHOW_TEXT_MODEL` 等 | 文案模型配置 |
| `YUNWU_IMAGE_*`、`FAL_KEY`、`FAL_IMAGE_MODEL` | 图片生成主渠道与备用渠道 |
| `R2_*` | Cloudflare R2 存储 |
| `REQUIRE_MAIN_APP_SSO`、`MAIN_APP_*` | 可选：挂到主站后面，通过一次性票据单点登录 |

## 测试

```bash
npm test
```

## 开发方式

先写 [`Prd.md`](Prd.md)，再按 `docs/superpowers/` 里的设计与实施计划，由 AI 编码代理（Codex / Claude Code）分步实现、逐项验收。
