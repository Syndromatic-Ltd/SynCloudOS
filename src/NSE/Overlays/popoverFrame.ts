const frameOutset = 12;
type PathCommand = readonly [operator: "M" | "L" | "Q" | "Z", ...coordinates: number[]];

function tracePath(commands: readonly PathCommand[], offset = 0): string {
  return commands.map(([operator, ...coordinates]) => [operator, ...coordinates.map(coordinate => coordinate + offset)].join(" ")).join(" ");
}

/** Geometry is written after Floating UI has resolved flips and shifts. The frame
 * and its stroke share one outline, including the arrow: no overlapping borders. */
export function updateNSEPopoverFrame(surface: HTMLElement, arrow: HTMLElement | null): void {
  const frame = surface.querySelector<SVGSVGElement>('[data-nse-part="popover-frame"]');
  if (!frame) return;
  const width = surface.offsetWidth, height = surface.offsetHeight;
  const radius = Math.min(10, width / 2, height / 2);
  const side = arrow ? surface.dataset.placement?.split("-")[0] : undefined;
  const centre = arrow ? Number.parseFloat(side === "top" || side === "bottom" ? arrow.style.left : arrow.style.top) + 10 : 0;
  const outline: PathCommand[] = [["M", radius, 0]];
  if (side === "bottom") outline.push(["L", centre - 10, 0], ["L", centre, -10], ["L", centre + 10, 0]);
  outline.push(["L", width - radius, 0], ["Q", width, 0, width, radius]);
  if (side === "left") outline.push(["L", width, centre - 10], ["L", width + 10, centre], ["L", width, centre + 10]);
  outline.push(["L", width, height - radius], ["Q", width, height, width - radius, height]);
  if (side === "top") outline.push(["L", centre + 10, height], ["L", centre, height + 10], ["L", centre - 10, height]);
  outline.push(["L", radius, height], ["Q", 0, height, 0, height - radius]);
  if (side === "right") outline.push(["L", 0, centre + 10], ["L", -10, centre], ["L", 0, centre - 10]);
  outline.push(["L", 0, radius], ["Q", 0, 0, radius, 0], ["Z"]);

  frame.setAttribute("viewBox", `${-frameOutset} ${-frameOutset} ${width + 2 * frameOutset} ${height + 2 * frameOutset}`);
  frame.querySelector('[data-nse-part="popover-outline"]')?.setAttribute("d", tracePath(outline));
  const backdrop = surface.querySelector<HTMLElement>(':scope > [data-nse-part="backdrop"]');
  if (backdrop) backdrop.style.clipPath = `path("${tracePath(outline, frameOutset)}")`;

  // Only this triangle is filled when the content paints its own plate.
  const triangle = side === "bottom" ? `M ${centre - 10} 0 L ${centre} -10 L ${centre + 10} 0 Z`
    : side === "top" ? `M ${centre - 10} ${height} L ${centre} ${height + 10} L ${centre + 10} ${height} Z`
    : side === "left" ? `M ${width} ${centre - 10} L ${width + 10} ${centre} L ${width} ${centre + 10} Z`
    : side === "right" ? `M 0 ${centre - 10} L -10 ${centre} L 0 ${centre + 10} Z` : "";
  frame.querySelector('[data-nse-part="popover-arrow-fill"]')?.setAttribute("d", triangle);
  if (!arrow) surface.dataset.nsePositioned = "true";
}
