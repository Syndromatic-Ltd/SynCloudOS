/** Geometry is written after Floating UI has resolved flips and shifts. The frame
 * and its stroke share one outline, including the arrow: no overlapping borders. */
export function updateNSEPopoverFrame(surface: HTMLElement, arrow: HTMLElement | null): void {
  const frame = surface.querySelector<SVGSVGElement>('[data-nse-part="popover-frame"]');
  if (!frame) return;
  const width = surface.offsetWidth, height = surface.offsetHeight;
  const radius = Math.min(10, width / 2, height / 2);
  const side = arrow ? surface.dataset.placement?.split("-")[0] : undefined;
  const centre = arrow ? Number.parseFloat(side === "top" || side === "bottom" ? arrow.style.left : arrow.style.top) + 10 : 0;
  const top = side === "bottom" ? `L ${centre - 10} 0 L ${centre} -10 L ${centre + 10} 0` : "";
  const right = side === "left" ? `L ${width} ${centre - 10} L ${width + 10} ${centre} L ${width} ${centre + 10}` : "";
  const bottom = side === "top" ? `L ${centre + 10} ${height} L ${centre} ${height + 10} L ${centre - 10} ${height}` : "";
  const left = side === "right" ? `L 0 ${centre + 10} L -10 ${centre} L 0 ${centre - 10}` : "";
  frame.setAttribute("viewBox", `-12 -12 ${width + 24} ${height + 24}`);
  frame.querySelector('[data-nse-part="popover-outline"]')?.setAttribute("d",
    `M ${radius} 0 ${top} L ${width - radius} 0 Q ${width} 0 ${width} ${radius} ${right} L ${width} ${height - radius} Q ${width} ${height} ${width - radius} ${height} ${bottom} L ${radius} ${height} Q 0 ${height} 0 ${height - radius} ${left} L 0 ${radius} Q 0 0 ${radius} 0 Z`);
  // Only this triangle is filled when the content paints its own plate.
  const triangle = side === "bottom" ? `M ${centre - 10} 0 L ${centre} -10 L ${centre + 10} 0 Z`
    : side === "top" ? `M ${centre - 10} ${height} L ${centre} ${height + 10} L ${centre + 10} ${height} Z`
    : side === "left" ? `M ${width} ${centre - 10} L ${width + 10} ${centre} L ${width} ${centre + 10} Z`
    : side === "right" ? `M 0 ${centre - 10} L -10 ${centre} L 0 ${centre + 10} Z` : "";
  frame.querySelector('[data-nse-part="popover-arrow-fill"]')?.setAttribute("d", triangle);
  if (!arrow) surface.dataset.nsePositioned = "true";
}
