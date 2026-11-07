/** Controller hosts are not print. Prefetch reuses a neighbour's semantic
 * content when it becomes the front. Reverse/ghost transforms remain part
 * of a back-face key, so a mirrored back can never stand in for a front. */
export function pageSurfaceKey(container: HTMLElement): string {
  if (container.classList.contains("nse-page__inside") || container.classList.contains("nse-page__face--front")) {
    const view = container.querySelector(".nse-page-controller__page [data-nse-view-controller]");
    if (view) return `controller-print:${view.innerHTML}`;
  }
  return container.innerHTML;
}
