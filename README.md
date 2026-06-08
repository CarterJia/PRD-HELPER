# PRD Helper

> 🔗 **在线体验(无需配置,直接玩):** https://prd-helper-rose.vercel.app

用自然语言描述产品想法,自动生成一份**结构化、诚实、可迭代**的 PRD 大纲。左侧对话、右侧文档画布,流式生成。

## 主要特性

- 🗣️ 自然语言 → 结构化 PRD 大纲(0 文档信息 + 8 核心模块 + 按需模块)
- 🤝 协作式精修:即时草稿 → 标注假设 + 澄清问题 → 多轮迭代
- 💡 诚实对待不确定性:假设显式标注,客观事实未知留 `[待填写]`,绝不编造
- ⚡ 流式生成,左对话 / 右文档画布(ChatGPT Canvas 式)
- ✍️ 局部 inline 编辑:划选任意段落 + 指令,只重写该段(对话管整体、划选管具体)
- 🎭 Demo 模式:无 API key 也能体验完整流程
- 📋 一键复制 / 下载 Markdown

## 运行方式

```bash
npm install
cp .env.local.example .env.local   # 填入 ANTHROPIC_API_KEY(留空则进入 Demo 模式)
npm run dev                        # http://localhost:3000
```

- 有 `ANTHROPIC_API_KEY`:调用 Claude 实时生成(默认 `claude-sonnet-4-6`,可用 `ANTHROPIC_MODEL` 覆盖)。
- 无 key:自动进入 **Demo 模式**,流式播放一份预置示例,零门槛体验。

测试:`npm test` ｜ 类型检查:`npm run typecheck` ｜ 生产构建:`npm run build`

## 设计思路(简述)

- **协作者交互**:先即时出草稿,再用"显式假设 + 澄清问题"逐步精修,而不是一次性硬生成。
- **对不确定性诚实**:推断内容标 `💡 假设`;人名等客观事实未知时留 `[待填写]`,绝不编造。
- **结构即观点**:固定包含「非目标」与功能优先级(P0/P1/P2),按需附加非功能需求/风险/里程碑。
- **架构**:Next.js 全栈;`/api/generate` 服务端流式调用 Claude,返回「Markdown 文档 + `<<<PRD_META>>>` 结构化尾块」,前端实时渲染画布、把假设/问题喂给对话区。版本号与修改时间由应用层确定性管理,不交给模型。

完整设计见 [`docs/superpowers/specs/2026-06-07-prd-helper-design.md`](docs/superpowers/specs/2026-06-07-prd-helper-design.md);产品说明见 [`docs/product-writeup.md`](docs/product-writeup.md)。

## 项目结构

```
app/                  页面 + /api/generate 流式路由
components/           ChatPanel · CanvasPanel · PrdDocument · …
hooks/useGeneration   客户端状态机(generate / refine / 流式)
lib/                  parse · markdown · prompt · claude(含 Mock)
mock/sample-prd.ts    Demo 模式预置示例
```

## 技术栈

Next.js + TypeScript + Tailwind · `@anthropic-ai/sdk` · react-markdown · Vitest
