/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** @internal The width an element's children share: its frame width less its inline padding and borders. */
export function contentInlineSize(element: HTMLElement, frameWidth: number): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return Math.max(0, frameWidth);
  const inset = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
    .reduce((total, value) => total + (parseFloat(value) || 0), 0);
  return Math.max(0, frameWidth - inset);
}
