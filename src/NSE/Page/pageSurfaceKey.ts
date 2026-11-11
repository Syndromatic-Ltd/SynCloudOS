/** Controller hosts are not print. Prefetch reuses a neighbour's semantic
 * content when it becomes the front. Reverse/ghost transforms remain part
 * of a back-face key, so a mirrored back can never stand in for a front. */
const printSources = new WeakMap<Element, HTMLElement>();

/** @internal A clone's remapped IDs are accessibility identity, not new print. */
export function rememberPagePrintSource(replica: Element, source: HTMLElement): void { printSources.set(replica, source); }

export function pageSurfaceKey(container: HTMLElement): string {
  if (container.classList.contains("nse-page__inside") || container.classList.contains("nse-page__face--front")) {
    const page = container.querySelector(".nse-page-controller__page");
    const source = page ? printSources.get(page) ?? page : null;
    const view = source?.querySelector("[data-nse-view-controller]");
    if (view) return `controller-print:${view.innerHTML}`;
  }
  return container.innerHTML;
}
