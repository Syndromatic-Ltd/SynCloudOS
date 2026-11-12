/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { isMirrorToken, mirroredHookName, mirroredHookNames, mirrorTokens } from "./hookMirror.mjs";

const attributeFilter = [...mirroredHookNames].map(name => `data-nse-${name}`);
const selector = attributeFilter.map(attribute => `[${attribute}]`).join(",");

/** Makes an element's mirror tokens agree with its hook attributes; writes nothing when they already do. */
function reconcile(element: Element): void {
  const wanted = new Set<string>();
  for (const attribute of element.attributes) {
    const name = mirroredHookName(attribute.name);
    if (name) for (const token of mirrorTokens(name, attribute.value)) wanted.add(token);
  }
  const list = element.classList;
  // Collect first: removing while iterating a live list skips tokens.
  const stale: string[] = [];
  for (const token of list) if (isMirrorToken(token) && !wanted.has(token)) stale.push(token);
  if (stale.length) list.remove(...stale);
  for (const token of wanted) if (!list.contains(token)) list.add(token);
}

/**
 * @internal Writes a contract hook and its mirror tokens together, for code that sets hooks without React.
 * A null value removes the hook.
 */
export function setNSEHook(element: Element, name: string, value: string | null): void {
  const attribute = `data-nse-${name}`;
  if (value === null) element.removeAttribute(attribute);
  else if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  if (mirroredHookNames.has(name)) reconcile(element);
}

const installed = new WeakMap<Document, { count: number; disconnect(): void }>();

/**
 * @internal Keeps mirror tokens in step for hooks the JSX runtime did not write: imperative DOM writes
 * and applications built without the SynWare plugin. Elements already in step cost one attribute scan.
 */
export function installNSEHookMirror(document: Document): () => void {
  let entry = installed.get(document);
  if (!entry) {
    const view = document.defaultView;
    if (!view || typeof view.MutationObserver !== "function") return () => undefined;
    const observer = new view.MutationObserver((records) => {
      const seen = new Set<Element>();
      const visit = (element: Element) => { if (!seen.has(element)) { seen.add(element); reconcile(element); } };
      for (const record of records) {
        if (record.type === "attributes") { visit(record.target as Element); continue; }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const element = node as Element;
          if (element.matches(selector)) visit(element);
          for (const descendant of element.querySelectorAll(selector)) visit(descendant);
        }
      }
    });
    // `class` too: a renderer that rewrites className would otherwise drop tokens it did not write.
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: [...attributeFilter, "class"] });
    for (const element of document.querySelectorAll(selector)) reconcile(element);
    entry = { count: 0, disconnect: () => observer.disconnect() };
    installed.set(document, entry);
  }
  entry.count++;
  const current = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--current.count === 0) { current.disconnect(); installed.delete(document); }
  };
}
