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

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXRubyAnnotation,
  TFXTypesetter,
} from "../../../src/FX/TextFX/public";
import {
  NSEAttachmentProjection,
  type NSEAttachmentProjectionAuthority,
} from "../../../src/NSE/TextLayout/attachmentProjection";
import { attachmentRun, type NSEAttributedAttachmentRun } from "../../../src/NSE/Text";

const japanese = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosansjp-vertical-subset.ttf")),
  new TFXFontDescriptor({ family: "Noto Sans JP", size: 20 }),
);

const arabicRuby = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf")),
  new TFXFontDescriptor({ family: "Noto Sans Arabic", size: 11 }),
);

function pixelImage(red = 31): GFXImage {
  return new GFXImage({
    width: 1,
    height: 1,
    alpha: "straight",
    colourSpace: "srgb",
    data: new Uint8Array([red, 80, 160, 255]),
  });
}

describe("TextFX inline depth", () => {
  it("lays out all four ruby positions with an independent ruby font and line-edge containment", async () => {
    const base = await japanese();
    const rubyFont = await arabicRuby();
    try {
      const annotation = new TFXRubyAnnotation({
        alignment: "lineEdge",
        overhang: "auto",
        collisionPolicy: "lineEdge",
        text: {
          before: { text: "前", font: rubyFont },
          after: { text: "後", font: rubyFont },
          interCharacter: { text: "間", font: rubyFont },
          inline: { text: "内", font: rubyFont },
        },
      });
      const attributed = new TFXAttributedString("日", [{
        start: 0,
        end: 1,
        font: base,
        language: "ja",
        rubyAnnotation: annotation,
      }]);
      const line = new TFXTypesetter(attributed).createLine(0, 1);
      const ruby = line.runs[0]!.ruby!;

      expect(ruby.map((entry) => entry.position)).toEqual(["before", "after", "interCharacter", "inline"]);
      expect(ruby.every((entry) => entry.font === rubyFont)).toBe(true);
      expect(ruby.every((entry) => entry.scale === 1)).toBe(true);
      expect(ruby.every((entry) => line.runs[0]!.x + entry.inlineOffset >= -1e-9)).toBe(true);
      expect(ruby.every((entry) => line.runs[0]!.x + entry.inlineOffset + entry.width <= line.width + 1e-9)).toBe(true);
      expect(line.offsetForStringIndex(0).primary).toBeGreaterThanOrEqual(0);
      expect(line.offsetForStringIndex(1).primary).toBeLessThanOrEqual(line.width + 1e-9);
      expect(line.stringIndexForPosition(line.offsetForStringIndex(1).primary)).toBe(1);
    } finally {
      base.dispose();
      rubyFont.dispose();
    }
  });

  it("makes line-edge ruby part of wrapping geometry without splitting the base range", async () => {
    const base = await japanese();
    try {
      const annotation = new TFXRubyAnnotation({
        alignment: "lineEdge",
        collisionPolicy: "lineEdge",
        text: { before: "日本日本" },
      });
      const input = new TFXAttributedString("日本", [
        { start: 0, end: 1, font: base, language: "ja", rubyAnnotation: annotation },
        { start: 1, end: 2, font: base, language: "ja" },
      ]);
      const typesetter = new TFXTypesetter(input);
      const first = typesetter.createLine(0, 1);
      const width = first.width + 0.01;
      expect(typesetter.suggestLineBreak(0, width)).toBe(1);
      expect(first.runs[0]!.ruby![0]!.cellWidth).toBeGreaterThanOrEqual(first.runs[0]!.ruby![0]!.width);
      expect(() => typesetter.createLine(0, 0)).not.toThrow();
      expect(() => new TFXTypesetter(new TFXAttributedString("日本", [{
        start: 0, end: 2, font: base, rubyAnnotation: annotation,
      }])).createLine(0, 1)).toThrow(/split.*ruby/i);
    } finally {
      base.dispose();
    }
  });

  it("projects transient blob, remote and file sources only through an injected scoped authority", async () => {
    const calls: string[] = [];
    const authority: NSEAttachmentProjectionAuthority = {
      async acquireSource(run, signal) {
        signal?.throwIfAborted();
        calls.push(`acquire:${run.source.kind}:${run.id}`);
        return Object.freeze({
          kind: "document-resource",
          documentId: "doc:owned",
          resourceId: `resource:${run.id}`,
          leaseId: `lease:${run.id}`,
          generation: calls.length,
          mimeType: "image/png",
          byteLength: 4,
        });
      },
      async resolveRunDelegate(request, signal) {
        signal?.throwIfAborted();
        calls.push(`resolve:${request.source.resourceId}`);
        return Object.freeze({
          width: 12,
          ascent: 9,
          descent: 3,
          attachment: Object.freeze({ image: pixelImage(), accessibilityLabel: request.accessibilityLabel }),
        }) as never;
      },
    };
    const projection = new NSEAttachmentProjection(authority);
    const runs: NSEAttributedAttachmentRun[] = [
      attachmentRun({ id: "blob-one", kind: "image", source: { kind: "blob", blobId: "clipboard:one", mimeType: "image/png", byteLength: 4 }, alt: "Blob chart" }),
      attachmentRun({ id: "remote-one", kind: "image", source: { kind: "remote", url: "https://example.invalid/chart.png", mimeType: "image/png" }, alt: "Remote chart" }),
      attachmentRun({ id: "file-one", kind: "file", source: { kind: "blob", blobId: "file:one", mimeType: "application/pdf", byteLength: 4 }, alt: "File attachment" }),
    ];

    for (const run of runs) {
      const projected = await projection.project(run);
      expect(projected.delegate.attachment.accessibilityLabel).toBe(run.alt);
      expect(projected.source.kind).toBe("document-resource");
      expect(projected.ownerId).toBe(run.id);
    }
    expect(calls).toEqual([
      "acquire:blob:blob-one", "resolve:resource:blob-one",
      "acquire:remote:remote-one", "resolve:resource:remote-one",
      "acquire:blob:file-one", "resolve:resource:file-one",
    ]);
  });

  it("never lets a late attachment decode replace a newer projection and propagates policy denial", async () => {
    let finishFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    let acquisition = 0;
    const authority: NSEAttachmentProjectionAuthority = {
      async acquireSource(run) {
        acquisition += 1;
        if (run.id === "denied") throw new DOMException("Remote image policy denied.", "SecurityError");
        if (acquisition === 1) await firstGate;
        return Object.freeze({
          kind: "document-resource",
          documentId: "doc:owned",
          resourceId: `resource:${acquisition}`,
          leaseId: `lease:${acquisition}`,
          generation: acquisition,
          mimeType: "image/png",
          byteLength: 4,
        });
      },
      async resolveRunDelegate(request) {
        return {
          width: 10,
          ascent: 8,
          descent: 2,
          attachment: Object.freeze({ image: pixelImage(80), accessibilityLabel: request.accessibilityLabel }),
        } as never;
      },
    };
    const projection = new NSEAttachmentProjection(authority);
    const oldRun = attachmentRun({ id: "same", kind: "image", source: { kind: "remote", url: "https://example.invalid/old.png" }, alt: "Old" });
    const newRun = attachmentRun({ id: "same", kind: "image", source: { kind: "remote", url: "https://example.invalid/new.png" }, alt: "New" });
    const oldPending = projection.project(oldRun);
    const newest = await projection.project(newRun);
    finishFirst();

    await expect(oldPending).rejects.toMatchObject({ name: "AbortError" });
    expect(newest.delegate.attachment.accessibilityLabel).toBe("New");
    await expect(projection.project(attachmentRun({
      id: "denied", kind: "image", source: { kind: "remote", url: "https://example.invalid/denied.png" }, alt: "Denied",
    }))).rejects.toMatchObject({ name: "SecurityError" });
  });
});
