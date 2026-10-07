/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {
  attributedContent, canonicalNSETextData, paragraph, parseAttributedContent, textRun,
  type NSEAttributedContent, type NSEAttributedRun, type NSEAttributedTextAttributes,
} from "../../../../src/NSE/Text";

// TEST ONLY: representative private Publisher wire data and a deliberately narrow
// application policy. This is neither a framework codec nor consumer implementation.
export interface HistoricPublisherNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: HistoricPublisherNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}
interface Issue {
  readonly kind: "unsupported-node" | "unsupported-mark" | "unsupported-attribute" | "unsupported-value";
  readonly path: string;
  readonly message: string;
}
const limits = { maxDepth: 24, maxNodes: 20_000, maxBytes: 1024 * 1024 };
const safeLink = (href: unknown): href is string => typeof href === "string" && /^(?:https?:|mailto:|\/|#)/i.test(href);

export function projectPublisherFixtureBody(input: HistoricPublisherNode) {
  const original = canonicalNSETextData(input, "test.publisher-body", limits);
  if (original.type !== "doc" || !Array.isArray(original.content)) throw new TypeError("Publisher fixture requires a document.");
  const issues: Issue[] = [];
  const issue = (kind: Issue["kind"], path: string) => issues.push({
    kind, path, message: "Outside this test-only application subset; exact native source retained.",
  });
  const inspect = (node: HistoricPublisherNode, path: string, parentType?: string) => {
    if (!node || typeof node.type !== "string") throw new TypeError("Invalid Publisher fixture node.");
    if (!["doc", "paragraph", "text"].includes(node.type)) issue("unsupported-node", path);
    if ((node.type === "doc" && path !== "") ||
        (node.type === "paragraph" && parentType !== "doc") ||
        (node.type === "text" && parentType !== "paragraph")) issue("unsupported-node", path);
    const fields = node.type === "text" ? ["type", "text", "marks"]
      : node.type === "doc" || node.type === "paragraph" ? ["type", "content"] : ["type", "content", "attrs", "text", "marks"];
    for (const key of Object.keys(node)) {
      if (!fields.includes(key)) issue("unsupported-attribute", path ? `${path}.${key}` : key);
    }
    for (const key of Object.keys(node.attrs ?? {})) issue("unsupported-attribute", `${path}.attrs.${key}`);
    if (node.type === "text" && typeof node.text !== "string") throw new TypeError("Publisher fixture text must be a string.");
    if (node.marks !== undefined && !Array.isArray(node.marks)) throw new TypeError("Invalid Publisher fixture marks.");
    node.marks?.forEach((mark, index) => {
      const markPath = `${path}.marks[${index}]`;
      if (!mark || typeof mark.type !== "string") throw new TypeError("Invalid Publisher fixture mark.");
      if (!["bold", "italic", "link"].includes(mark.type)) issue("unsupported-mark", markPath);
      for (const key of Object.keys(mark.attrs ?? {})) {
        if (!(mark.type === "link" && key === "href")) issue("unsupported-attribute", `${markPath}.attrs.${key}`);
      }
      if (mark.type === "link" && !safeLink(mark.attrs?.href)) issue("unsupported-value", `${markPath}.attrs.href`);
    });
    if (node.content !== undefined && !Array.isArray(node.content)) throw new TypeError("Invalid Publisher fixture content.");
    node.content?.forEach((child, index) => inspect(child, path ? `${path}.content[${index}]` : `content[${index}]`, node.type));
  };
  inspect(original, "");
  const inline = (node: HistoricPublisherNode): NSEAttributedRun[] => {
    if (node.type !== "text") return node.content?.flatMap(inline) ?? [];
    const attributes: NSEAttributedTextAttributes = {};
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") Object.assign(attributes, { bold: true });
      if (mark.type === "italic") Object.assign(attributes, { italic: true });
      if (mark.type === "link" && safeLink(mark.attrs?.href)) Object.assign(attributes, { link: mark.attrs.href });
    }
    return [textRun(node.text!, Object.keys(attributes).length ? attributes : undefined)];
  };
  const blocks = (node: HistoricPublisherNode): ReturnType<typeof paragraph>[] =>
    node.type === "paragraph" || node.type === "heading"
      ? [paragraph(node.content?.flatMap(inline) ?? [])]
      : node.content?.flatMap(blocks) ?? [];
  const projected = original.content.flatMap(blocks);
  return Object.freeze({
    original, content: attributedContent(projected.length ? projected : [paragraph([])]),
    lossless: issues.length === 0,
    issues: Object.freeze(issues.map(value => Object.freeze(value))),
  });
}

export function publisherFixtureBodyFromContent(input: NSEAttributedContent): HistoricPublisherNode {
  const content = parseAttributedContent(input);
  return canonicalNSETextData({
    type: "doc",
    content: content.blocks.map(block => {
      if (block.attributes) throw new TypeError("Paragraph attributes are outside the test-only application subset.");
      return { type: "paragraph", content: block.runs.map(run => {
        if (run.kind !== "text") throw new TypeError("Attachments require a real application codec and asset policy.");
        const attributes = run.attributes ?? {};
        if (Object.keys(attributes).some(key => !["bold", "italic", "link"].includes(key)) ||
            attributes.bold === false || attributes.italic === false) throw new TypeError("Text attributes are outside the test-only application subset.");
        return { type: "text", text: run.text, marks: [
          ...(attributes.bold ? [{ type: "bold" }] : []),
          ...(attributes.italic ? [{ type: "italic" }] : []),
          ...(attributes.link ? [{ type: "link", attrs: { href: attributes.link } }] : []),
        ] };
      }) };
    }),
  }, "test.publisher-write", limits);
}
