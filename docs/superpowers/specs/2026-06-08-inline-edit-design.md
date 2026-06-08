# 局部 inline 编辑 —— 设计文档 (Design Spec)

- **日期**:2026-06-08
- **作者**:CarterJia
- **状态**:已评审,待实现
- **一句话**:在 PRD 画布里拖选一段文字 + 输入指令,只重写该段、其余不动 —— 把"整篇刷新"升级为"局部精修"。

---

## 1. 背景与目标

当前 `hooks/useGeneration.ts` 的 `refine()` 每次都**整篇重新生成**(见主设计 `2026-06-07-prd-helper-design.md` §5.4),代价:微调一处会动到用户满意的部分、token 成本高。这正是主 spec §"再给一周"里列出的优化项。

本功能实现**局部 inline 编辑**:用户在文档里拖选 → 输入指令 → 仅该片段流式重写。

---

## 2. 设计决策

- **粒度**:inline(子模块级,而非整节)。
- **选区机制**:**拖选,吸附到块**。用户可自由划选,系统把选区扩展到其覆盖的整块,按块的源码区间替换。兼顾"选中"手感与定位可靠性。
- **为什么不做任意字符级选区**:渲染后的文字 ≠ Markdown 源码(`**加粗**`、`[P0]`、表格列等),任意字符选区映射回源码脆弱、易失败。按块定位规避此问题。

---

## 3. UX 流程

```
用户在右侧 PRD 正文里拖选一段
        ↓ 松开鼠标
选区自动吸附到所覆盖的整块,块高亮
        ↓ 选区旁弹出小输入框 (InlineEditPopover)
输入指令(如"改得更偏 B2B" / "加一个 P0 功能")
        ↓ 回车
仅该段落原地流式重写,其余文档不变
        ↓ 完成
版本 V0.x+1、最后修改时间刷新、对话区留一条 ✏️ 记录
```

---

## 4. 关键技术:用"块的源码偏移"定位(成败点)

react-markdown 渲染时,每个块的 `node.position.start.offset` / `end.offset` 是它在**传入的 Markdown 字符串里的字符偏移**。做法:

1. 把 `state.document`(模型正文,**不含**应用自带的元信息表头)单独传给 `<ReactMarkdown>`,于是偏移干净映射进 `state.document`。
2. 自定义块级组件(p / li / h2 / blockquote / tr 等)时,把 `node.position` 写成 `data-md-start` / `data-md-end`。
3. 拖选后,取所有被选区覆盖的块,`start = min(各块 data-md-start)`,`end = max(各块 data-md-end)` → 得到源码区间 `[start, end)`。

> ⚠️ **关键假设 = 实现第一步**:先用一个 5 分钟 spike 验证 react-markdown 在自定义组件里确实暴露 `node.position.*.offset`。若不可用,降级方案:按 `##` 标题分节 + 段落切分,自行计算块的源码区间。

---

## 5. 架构与文件

**新增**
- `app/api/edit/route.ts`(+ `route.test.ts`)— 流式编辑端点
- `lib/edit.ts`(+ `edit.test.ts`)— `spliceDocument(doc, start, end, replacement)` 纯函数 + `stripCodeFence(s)` 去围栏
- `components/InlineEditPopover.tsx` — 选区旁的指令输入框

**修改**
- `lib/prompt.ts` — 加 `buildEditSystemPrompt()` + `buildEditMessages({document, excerpt, instruction})`
- `lib/claude.ts` — 加 `streamEdit(req)`(真实调用 + mock 模式,Demo 也能用)
- `lib/types.ts` — 加 `EditRequest { document; start; end; instruction }`
- `components/PrdDocument.tsx` — **重构**:元信息表头改为独立**不可编辑**块;正文单独渲染、带块偏移、向上回调选区;高亮选中块
- `components/CanvasPanel.tsx` — 承载选区 → 弹框 → 调用编辑;编辑中禁用导出/重复编辑
- `hooks/useGeneration.ts` — 加 `editSpan({start, end, instruction})`

---

## 6. 数据流

1. 选区松开 → 解析 `[start, end)` + 高亮覆盖块 → 弹 `InlineEditPopover`
2. 提交指令 → `editSpan` → `POST /api/edit { document: state.document, start, end, instruction }`
3. 服务端:`excerpt = document.slice(start, end)`,用编辑 prompt + 完整文档上下文,**流式**返回**仅该片段**的新 markdown
4. 前端编辑开始时固定 `before = doc.slice(0, start)`、`after = doc.slice(end)`;流式期间 `document = before + 已收增量 + after` 原地更新
5. 完成:`spliceDocument` 定稿、版本 +1、`最后修改时间`刷新、对话区追加「✏️ 已按「<指令>」修改选中段落」

---

## 7. 编辑 Prompt(与生成 prompt 分开)

System(`buildEditSystemPrompt`):

> 你在编辑一份 PRD 的某一段。下面给出完整 PRD 作上下文。**只重写**给定片段以满足用户指令,保持相同的 markdown 结构与标题层级,与全文保持一致。**只输出替换后的 markdown**,不要解释、不要代码围栏、不要复述其他部分。

User(`buildEditMessages`):传入 `完整文档`、`待修改片段`、`用户指令` 三段。

---

## 8. 版本 / 对话行为

- inline 编辑算一次改动:**版本 +1、最后修改时间刷新**(体现"活文档")。沿用 `useGeneration` 的 `regenRef` 计数器。
- 对话区追加一条简短 ✏️ 记录,便于追溯。
- **不**重新生成假设 / 澄清问题列表(targeted 编辑,不发散),对话区现有问题保持不变。

---

## 9. 异常与边界

| 场景 | 处理 |
|------|------|
| 选区落在元信息表头(不可编辑)| 忽略,不弹框 |
| 选区解析不出块 | 忽略并提示"请选正文段落" |
| 正在生成或编辑中 | 禁用新的编辑(复用 `isStreaming`)|
| 指令为空 | 不发送 |
| 模型误包代码围栏 | `stripCodeFence` 去掉外层 ```` ``` ```` 再 splice |
| `/api/edit` 报错 | 对话区友好提示,文档回滚到编辑前 |

---

## 10. 测试策略

- `spliceDocument` / `stripCodeFence` 纯函数单测(含越界、空替换)
- `buildEditMessages` / `buildEditSystemPrompt` 单测(含上下文/片段/指令)
- `/api/edit` 路由集成测试(mock `streamEdit`,校验 400 与流式)
- `streamEdit` mock 模式单测
- 选区→区间(依赖 DOM)→ 手动验收脚本

---

## 11. 本功能非目标

- 不做撤销/重做栈(刷新即重来,v1 不持久化)。
- 不做跨多个**不相邻**块的选区(仅支持连续区间)。
- 不做手动直接键入编辑(仍走"选区 + 指令")。
- 不在编辑后重算假设/问题列表。

---

## 12. 风险

- **react-markdown 是否暴露源码偏移**:本功能成败点,实现第一步 spike 验证,有降级方案(§4)。
- **流式期间选区错位**:编辑期间禁用新选区,规避。
