/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** DOM identity must survive presentation in a different same-origin realm. */
export function isNSEDOMNode(target: EventTarget | null | undefined): target is Node {
  return target != null && "nodeType" in target;
}

export function isNSEDOMElement(target: EventTarget | null | undefined): target is Element {
  return isNSEDOMNode(target) && target.nodeType === 1;
}

export function isNSEHTMLElement(target: EventTarget | null | undefined): target is HTMLElement {
  return isNSEDOMElement(target) && target.namespaceURI === "http://www.w3.org/1999/xhtml";
}
