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

import { describe, expect, it } from "vitest";
import {
  projectPublisherFixtureBody,
  publisherFixtureBodyFromContent,
  type HistoricPublisherNode,
} from "./fixtures/publisher-app-policy";
import {
  attributedContent, attributedContentText, attachmentRun, paragraph, textRun,
  normalizeNSEAttributedContentNewlines, plainNSETextContent, canonicalNSETextData,
  type NSEAttributedContent,
} from "../../../src/NSE/Text";

// TEST ONLY: representative private application data; no consumer/backend/runtime imports.
const flowIds = ["abstract", "body", "references"] as const;
type Flow = typeof flowIds[number];
type HistoricPublisherBody = string | HistoricPublisherNode | Array<{ id: string; type: string; text?: string; children?: unknown[] }>;
interface Article {
  id: string; kind: "journal.draft"; bodyFormat: "plainText" | "markdown" | "html" | "structured";
  abstract: HistoricPublisherBody; body: HistoricPublisherBody; references: HistoricPublisherBody;
  title: string; folderId: string; keywords: string; authorIds: string[]; mediaAssetIds: string[];
  publish: { state: string; slug: string; scheduledFor: string };
  providerProjection: { revision: number; ifMatch: string; idempotencyKey: string; autosavedAt: string };
  providerAcknowledgedBase: { presence: "present"; etag: string; fingerprint: string };
  privateExtension: { citationIds: string[]; styleId: string };
}
function node(text: string): HistoricPublisherNode {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}
function article(): Article {
  return {
    id: "article:one", kind: "journal.draft", bodyFormat: "structured",
    abstract: node("Abstract"), body: node("Main body"), references: node("References"),
    title: "Native article", folderId: "folder:research", keywords: "text, geometry",
    authorIds: ["author:one"], mediaAssetIds: ["media:one"],
    publish: { state: "scheduled", slug: "native-article", scheduledFor: "2026-10-03T12:00:00Z" },
    providerProjection: { revision: 7, ifMatch: '"etag:7"', idempotencyKey: "projection:one:7", autosavedAt: "2026-10-01T09:00:00Z" },
    providerAcknowledgedBase: { presence: "present", etag: '"etag:6"', fingerprint: "native-provider-fingerprint" },
    // A rehearsal-only extension tests an app codec's unknown-field preservation policy.
    privateExtension: { citationIds: ["citation:one"], styleId: "style:body" },
  };
}

interface FidelityReceipt {
  readonly status: "complete" | "partial" | "rejected";
  readonly documentId: string;
  readonly flowId: Flow;
  readonly sourceFormat: Article["bodyFormat"];
  readonly original: HistoricPublisherBody;
  readonly content?: NSEAttributedContent;
  readonly issues: readonly { readonly kind: string; readonly path: string; readonly message: string }[];
}

// These are local rehearsal guards, not an added framework codec or a migrated consumer.
function rehearseArticle(native: Article): Record<Flow, FidelityReceipt> {
  return Object.fromEntries(flowIds.map(flowId => {
    const original = native[flowId];
    const sourceFormat = flowId === "body" ? native.bodyFormat : typeof original === "string" ? "plainText" : "structured";
    const base = { documentId: native.id, flowId, sourceFormat, original };
    const reject = (kind: string, message: string): FidelityReceipt => Object.freeze({
      ...base, status: "rejected", issues: Object.freeze([Object.freeze({ kind, path: flowId, message })]),
    });
    if (Array.isArray(original)) return [flowId, reject("unsupported-native-body", "Stable block IDs/children need an application codec; flattening is refused.")];
    if (typeof original === "string" && sourceFormat !== "plainText") return [flowId, reject("unsupported-native-body", "HTML/Markdown/ambiguous structured source needs an explicit application parser.")];
    try {
      if (typeof original === "string") {
        const normalization = normalizeNSEAttributedContentNewlines(attributedContent([paragraph([textRun(original)])]));
        return [flowId, Object.freeze({ ...base, status: normalization.changed ? "partial" : "complete", content: normalization.content,
          issues: Object.freeze(normalization.changed ? [Object.freeze({ kind: "newline-normalization", path: flowId, message: "LF projection differs; exact source retained. Application normalization policy is required." })] : []),
        })];
      }
      const converted = projectPublisherFixtureBody(original);
      return [flowId, Object.freeze({ ...base, original: converted.original, status: converted.lossless ? "complete" : "partial", content: converted.content, issues: converted.issues })];
    } catch (error) {
      return [flowId, reject("invalid-or-bounded-input", error instanceof Error ? error.message : String(error))];
    }
  })) as Record<Flow, FidelityReceipt>;
}

function writeNativeFlow(native: Article, flowId: Flow, receipt: FidelityReceipt, content: NSEAttributedContent): Article {
  if (receipt.status !== "complete") throw new Error(`Native write refused: ${receipt.status} fidelity receipt.`);
  const sourceFormat = flowId === "body" ? native.bodyFormat : typeof native[flowId] === "string" ? "plainText" : "structured";
  if (receipt.documentId !== native.id || receipt.flowId !== flowId || receipt.sourceFormat !== sourceFormat || JSON.stringify(canonicalNSETextData(receipt.original)) !== JSON.stringify(canonicalNSETextData(native[flowId]))) throw new Error("Native conversion receipt is stale.");
  // Validate the replacement before constructing any next article. Unrelated native fields survive.
  const nextFlow = publisherFixtureBodyFromContent(content);
  return { ...structuredClone(native), [flowId]: nextFlow, ...(flowId === "body" ? { bodyFormat: "structured" as const } : {}) };
}

describe("test-only Publisher application policy fidelity rehearsal", () => {
  it("round-trips only the rehearsal paragraph/text subset, including empty paragraphs", () => {
    const content = attributedContent([
      paragraph([
        textRun("A😀\nB", { bold: true, italic: true, link: "https://example.test/reference" }),
      ]),
      paragraph([]),
    ]);
    const receipt = projectPublisherFixtureBody(publisherFixtureBodyFromContent(content));
    expect(receipt.lossless).toBe(true);
    expect(receipt.issues).toEqual([]);
    expect(receipt.content).toEqual(content);
  });

  it("preserves all native article fields and untouched siblings when a complete body projection is edited", () => {
    const native = article();
    const before = structuredClone(native);
    const receipts = rehearseArticle(native);
    expect(flowIds.map(id => receipts[id].status)).toEqual(["complete", "complete", "complete"]);
    const next = writeNativeFlow(native, "body", receipts.body, plainNSETextContent("Changed body"));
    const { body: _beforeBody, ...beforeEnvelope } = before;
    const { body: nextBody, ...nextEnvelope } = next;
    expect(nextEnvelope).toEqual(beforeEnvelope);
    expect(nextBody).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Changed body", marks: [] }] }] });
    expect(native).toEqual(before);
    expect(next.providerProjection).toEqual(before.providerProjection);
    expect(next.providerAcknowledgedBase).toEqual(before.providerAcknowledgedBase);
  });

  it("reports headings/lists/private callouts and citation attributes as partial and keeps the exact original", () => {
    const native = article();
    native.body = { type: "doc", content: [
      { type: "heading", attrs: { level: 2, styleId: "style:heading" }, content: [{ type: "text", text: "Heading" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Entry" }] }] }] },
      { type: "journalCallout", attrs: { calloutId: "callout:one" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Citation", marks: [{ type: "journalCitation", attrs: { referenceId: "citation:one" } }] }] }] },
    ] };
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("partial");
    expect(receipt.original).toEqual(native.body);
    expect(Object.isFrozen(receipt.original)).toBe(true);
    expect(receipt.issues.map(issue => issue.path)).toEqual(expect.arrayContaining(["content[0]", "content[0].attrs.styleId", "content[1]", "content[2]"]));
    expect(receipt.issues.some(issue => issue.kind === "unsupported-mark")).toBe(true);
    expect(() => writeNativeFlow(native, "body", receipt, plainNSETextContent("flattened"))).toThrow(/partial/);
    expect(native.body).toEqual(receipt.original);
  });

  it("keeps current raw image URL/width/title data in partial original rather than inventing a durable asset", () => {
    const native = article();
    native.body = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "image", attrs: { src: "https://media.example.test/figure.png", alt: "A figure", title: "Native title", width: 320 } },
    ] }] };
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("partial");
    expect(receipt.original).toEqual(native.body);
    expect(receipt.issues.some(issue => issue.kind === "unsupported-node")).toBe(true);
    expect(receipt.content!.blocks.flatMap(block => block.runs).filter(run => run.kind === "attachment")).toHaveLength(0);
    expect(() => writeNativeFlow(native, "body", receipt, plainNSETextContent(""))).toThrow(/partial/);
  });

  it("reports dropped unsafe marks as partial, never silently lossless", () => {
    const native = article();
    native.references = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
    const receipt = rehearseArticle(native).references;
    expect(receipt.status).toBe("partial");
    expect(receipt.issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "unsupported-value", path: "content[0].content[0].marks[0].attrs.href" })]));
    expect(receipt.original).toEqual(native.references);
  });

  it("rejects native structured block arrays rather than flattening their stable IDs and child structure", () => {
    const native = article();
    native.body = [{ id: "block:one", type: "callout", text: "Native", children: [{ id: "block:child", type: "citation", text: "Reference" }] }];
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("rejected");
    expect(receipt.issues).toEqual([expect.objectContaining({ kind: "unsupported-native-body", path: "body" })]);
    expect(receipt.original).toEqual(native.body);
    expect(receipt.content).toBeUndefined();
  });

  it.each(["html", "markdown"] as const)("rejects unparsed %s source and retains the native format", format => {
    const native = article(); native.body = format === "html" ? "<h2>Heading</h2>" : "## Heading"; native.bodyFormat = format;
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("rejected"); expect(receipt.original).toBe(native.body);
    expect(native.bodyFormat).toBe(format);
    expect(() => writeNativeFlow(native, "body", receipt, plainNSETextContent("Heading"))).toThrow(/rejected/);
  });

  it("exposes newline normalization as a partial receipt while preserving exact plain source", () => {
    const native = article(); native.bodyFormat = "plainText"; native.body = "A\r\nB\rC";
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("partial");
    expect(receipt.original).toBe("A\r\nB\rC");
    expect(attributedContentText(receipt.content!)).toBe("A\nB\nC");
    expect(receipt.issues).toEqual([expect.objectContaining({ kind: "newline-normalization", path: "body" })]);
  });

  it.each(["oversized", "cycle"] as const)("rejects %s input without changing any native flow", failure => {
    const native = article();
    if (failure === "oversized") native.body = node("x".repeat(1_048_577));
    else { const cyclic: HistoricPublisherNode = { type: "doc" }; cyclic.content = [cyclic]; native.body = cyclic; }
    const body = native.body;
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("rejected"); expect(receipt.content).toBeUndefined();
    expect(receipt.issues[0].kind).toBe("invalid-or-bounded-input");
    expect(native.body).toBe(body);
    expect(() => writeNativeFlow(native, "body", receipt, plainNSETextContent(""))).toThrow(/rejected/);
  });

  it("rejects a conversion receipt for another original article flow", () => {
    const native = article(); const receipt = rehearseArticle(native).body;
    const newer = { ...native, body: node("New native content") };
    expect(() => writeNativeFlow(newer, "body", receipt, plainNSETextContent("Obsolete edit"))).toThrow(/stale/);
    expect(newer.body).toEqual(node("New native content"));
  });

  it("refuses portable attachments and rich attributes outside the fixture's application subset", () => {
    const native = article();
    const receipt = rehearseArticle(native).body;
    const replacement = attributedContent([paragraph([
      attachmentRun({ id: "object:one", kind: "image", source: { kind: "blob", blobId: "bytes:one" }, alt: "Figure" }),
    ])]);
    expect(() => writeNativeFlow(native, "body", receipt, replacement)).toThrow(/application codec/i);
    expect(() => writeNativeFlow(native, "body", receipt, attributedContent([paragraph([
      textRun("Rich", { language: "en" }),
    ])]))).toThrow(/outside.*subset/i);
    expect(native).toEqual(article());
  });

  it("rejects accessor-backed historic data without invoking it or modifying the native article", () => {
    const native = article();
    let reads = 0;
    const original: HistoricPublisherNode = { type: "doc" };
    Object.defineProperty(original, "content", {
      enumerable: true, get() { reads += 1; throw new Error("native getter executed"); },
    });
    native.body = original;
    const receipt = rehearseArticle(native).body;
    expect(receipt.status).toBe("rejected");
    expect(receipt.issues[0].kind).toBe("invalid-or-bounded-input");
    expect(reads).toBe(0);
    expect(native.body).toBe(original);
  });
});
