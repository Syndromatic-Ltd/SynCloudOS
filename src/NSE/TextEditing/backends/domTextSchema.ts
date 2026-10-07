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

import { Schema, type Node, type DOMOutputSpec } from "@tiptap/pm/model";
import { attributedContent, paragraph, textRun, attachmentRun, normaliseNSETextAttributes, normaliseNSEParagraphAttributes, type NSEAttributedContent, type NSEAttributedTextAttributes, type NSEAttributedAttachmentRun } from "../../Text";

function characterStyle(attributes: NSEAttributedTextAttributes): string {
  const declarations: string[] = [];
  if (attributes.bold) declarations.push("font-weight:700");
  if (attributes.italic) declarations.push("font-style:italic");
  const decoration = [attributes.underline && "underline", attributes.strike && "line-through"].filter(Boolean).join(" ");
  if (decoration) declarations.push(`text-decoration:${decoration}`);
  if (attributes.foregroundColour) declarations.push(`color:${attributes.foregroundColour}`);
  if (attributes.backgroundColour) declarations.push(`background-color:${attributes.backgroundColour}`);
  if (attributes.font?.size) declarations.push(`font-size:${attributes.font.size}px`);
  if (attributes.font?.familyId) declarations.push(`font-family:"${attributes.font.familyId}"`);
  if (attributes.baseline && attributes.baseline !== "normal") declarations.push(`vertical-align:${attributes.baseline === "superscript" ? "super" : "sub"}`);
  if (attributes.shadow) declarations.push(`text-shadow:${attributes.shadow.offsetX}px ${attributes.shadow.offsetY}px ${attributes.shadow.blur}px ${attributes.shadow.colour}`);
  if (attributes.baselineOffset) declarations.push("position:relative", `top:${-attributes.baselineOffset}px`);
  if (attributes.kern) declarations.push(`letter-spacing:${attributes.kern}px`);
  if (attributes.capitalisation === "all-caps") declarations.push("text-transform:uppercase");
  else if (attributes.capitalisation === "title") declarations.push("text-transform:capitalize");
  else if (attributes.capitalisation === "small-caps") declarations.push("font-variant-caps:all-small-caps");
  if (attributes.ligatures === "none") declarations.push("font-variant-ligatures:none");
  else if (attributes.ligatures === "all") declarations.push("font-variant-ligatures:common-ligatures discretionary-ligatures");
  if (attributes.outline) declarations.push("-webkit-text-fill-color:transparent", "-webkit-text-stroke:0.045em currentColor", "paint-order:stroke fill");
  return declarations.join(";");
}
/** Accessible stand-in used when an attachment has no resolvable image. */
export function attachmentPlaceholder(run: NSEAttributedAttachmentRun): DOMOutputSpec {
  return ["span", { class: "nse-text-attachment", "data-kind": run.attachmentKind, role: "img", "aria-label": run.alt, contenteditable: "false" }, run.alt || "Attachment"];
}
function parseData(element: HTMLElement, key: string, validate: (value: unknown) => unknown): false | { value: unknown } {
  const encoded = element.getAttribute(key);
  if (!encoded || encoded.length > 8192) return false;
  try { return { value: validate(JSON.parse(encoded)) }; } catch { return false; }
}
export const domTextSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "inline*", group: "block", attrs: { value: { default: {} } },
      parseDOM: [
        { tag: "p", getAttrs: element => parseData(element as HTMLElement, "data-nse-paragraph", normaliseNSEParagraphAttributes) || { value: {} } },
        // Headings: validated paragraph data wins; foreign HTML keeps only its level.
        ...([1, 2, 3, 4, 5, 6] as const).map(level => ({ tag: `h${level}`, getAttrs: (element: string | HTMLElement) => parseData(element as HTMLElement, "data-nse-paragraph", normaliseNSEParagraphAttributes) || { value: { headerLevel: level } } })),
      ],
      toDOM: node => {
        const attributes = normaliseNSEParagraphAttributes(node.attrs.value);
        const depth = attributes.textLists?.length ?? 0;
        const headIndent = depth ? `calc(${depth * 1.75}em + ${attributes.headIndent ?? 0}px)` : `${attributes.headIndent ?? 0}px`;
        const style = [
          `text-align:${attributes.alignment === "centre" ? "center" : attributes.alignment ?? "start"}`, `text-indent:${attributes.firstLineHeadIndent ?? 0}px`, `padding-inline-start:${headIndent}`, `padding-inline-end:${attributes.tailIndent ?? 0}px`,
          ...(depth ? [`--nse-list-gutter:calc(${(depth - 1) * 1.75}em + ${attributes.headIndent ?? 0}px)`] : []),
          ...(attributes.lineHeightMultiple ? [`line-height:${attributes.lineHeightMultiple}`] : []),
          ...(attributes.paragraphSpacingBefore !== undefined ? [`margin-block-start:${attributes.paragraphSpacingBefore}px`] : []),
          ...(attributes.paragraphSpacing !== undefined ? [`margin-block-end:${attributes.paragraphSpacing}px`] : []),
        ].join(";");
        const tag = attributes.headerLevel ? `h${attributes.headerLevel}` : "p";
        return [tag, { style, "data-nse-paragraph": JSON.stringify(attributes), ...(depth ? { "data-nse-list-depth": String(depth) } : {}) }, 0] as DOMOutputSpec;
      },
    },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
    attachment: {
      inline: true, group: "inline", atom: true, attrs: { value: {} },
      // Untrusted clipboard HTML cannot mint resource authority.
      toDOM: node => attachmentPlaceholder(node.attrs.value as NSEAttributedAttachmentRun),
    },
  },
  marks: {
    attributes: {
      attrs: { value: { default: {} } },
      parseDOM: [{ tag: "span[data-nse-attributes]", getAttrs: element => parseData(element as HTMLElement, "data-nse-attributes", normaliseNSETextAttributes) }],
      toDOM: mark => {
        const attrs = normaliseNSETextAttributes(mark.attrs.value);
        const span: DOMOutputSpec = ["span", { style: characterStyle(attrs), "data-nse-attributes": JSON.stringify(attrs), ...(attrs.language ? { lang: attrs.language } : {}) }, 0];
        return attrs.link ? ["a", { href: attrs.link, rel: "noopener noreferrer" }, span] : span;
      },
    },
  },
});

export function backendDocumentFromContent(content: NSEAttributedContent): Node {
  const blocks = content.blocks.map(block => domTextSchema.node("paragraph", { value: block.attributes ?? {} }, block.runs.flatMap(run => {
    if (run.kind === "attachment") return [domTextSchema.node("attachment", { value: run })];
    const marks = run.attributes && Object.keys(run.attributes).length ? [domTextSchema.mark("attributes", { value: run.attributes })] : [];
    const nodes: Node[] = [];
    run.text.split("\n").forEach((part, index) => { if (index) nodes.push(domTextSchema.node("hardBreak", null, undefined, marks)); if (part) nodes.push(domTextSchema.text(part, marks)); });
    return nodes;
  })));
  return domTextSchema.node("doc", null, blocks.length ? blocks : [domTextSchema.node("paragraph")]);
}
export function contentFromBackendDocument(document: Node): NSEAttributedContent {
  const blocks = [];
  for (let index = 0; index < document.childCount; index++) {
    const node = document.child(index);
    if (node.type.name !== "paragraph") throw new TypeError("Bounded text view supports paragraphs only.");
    const runs = [];
    for (let child = 0; child < node.childCount; child++) {
      const inline = node.child(child);
      if (inline.type.name === "attachment") runs.push(attachmentRun({ ...inline.attrs.value, kind: inline.attrs.value.attachmentKind }));
      else if (inline.isText || inline.type.name === "hardBreak") runs.push(textRun(inline.isText ? inline.text! : "\n", inline.marks.find(mark => mark.type.name === "attributes")?.attrs.value));
      else throw new TypeError("Unsupported inline text view content.");
    }
    blocks.push(paragraph(runs, normaliseNSEParagraphAttributes(node.attrs.value)));
  }
  return attributedContent(blocks);
}
