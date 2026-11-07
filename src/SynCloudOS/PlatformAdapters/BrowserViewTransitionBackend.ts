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

const activeDocuments = new WeakSet<Document>();
let sequence = 0;
interface BrowserViewTransition { readonly ready: Promise<void>; readonly finished: Promise<void>; skipTransition(): void }
/** Internal crossfade backend. AFX owns the caller's duration, reduction and settlement. */
export function startBrowserViewTransition(element: HTMLElement, update: () => void, options: { readonly duration: number; readonly reducedMotion: boolean; readonly signal: AbortSignal }): { readonly finished: Promise<void>; cancel(): void } | null {
  const document = element.ownerDocument;
  if (!document.startViewTransition || options.reducedMotion || options.duration <= 0 || options.signal.aborted || activeDocuments.has(document)) return null;
  const name = `syncloudos-view-${++sequence}`, previous = element.style.viewTransitionName;
  const style = document.createElement("style"); style.dataset.syncloudosViewTransition = "";
  style.textContent = `::view-transition-old(root),::view-transition-new(root){animation:none}::view-transition-group(${name}){animation-duration:${options.duration}s}::view-transition-old(${name}),::view-transition-new(${name}){animation-duration:${options.duration}s}`;
  element.style.viewTransitionName = name; document.head.append(style); activeDocuments.add(document);
  let transition: BrowserViewTransition;
  const cleanup = () => { element.style.viewTransitionName = previous; style.remove(); activeDocuments.delete(document); options.signal.removeEventListener("abort", cancel); };
  const cancel = () => transition?.skipTransition();
  try { transition = document.startViewTransition(update); }
  catch { cleanup(); return null; }
  options.signal.addEventListener("abort", cancel, { once: true });
  void transition.ready.catch(() => {});
  const finished = transition.finished.then(() => {}, () => {}).finally(cleanup);
  return { finished, cancel };
}
