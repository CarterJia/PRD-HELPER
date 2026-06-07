export interface DocMeta {
  createdAt: string;
  modifiedAt: string;
  version: string;
  status: string;
}

/** App-owned document-info header (§0). People fields stay placeholders. */
export function buildMetadataMarkdown(meta: DocMeta): string {
  return [
    "## 0. 文档信息",
    "",
    "| 字段 | 内容 |",
    "| --- | --- |",
    "| 负责人 / 作者 | [待填写] |",
    "| 评审 / 研发 / 设计 | [待填写] |",
    `| 创建时间 | ${meta.createdAt || "—"} |`,
    `| 最后修改时间 | ${meta.modifiedAt || "—"} |`,
    `| 版本 | ${meta.version} |`,
    `| 状态 | ${meta.status} |`,
  ].join("\n");
}

/** Full markdown for copy/download: title + metadata header + model body. */
export function buildExportMarkdown(meta: DocMeta, document: string): string {
  return `# 产品需求文档 (PRD)\n\n${buildMetadataMarkdown(meta)}\n\n${document.trim()}\n`;
}
