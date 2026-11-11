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

import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { resolveNSESpacing } from "./layoutSpacing";
import { NSEStackItem } from "./NSEStackItem";
import { NSEStackVisibilityPriority, type NSEStackAlignment, type NSEStackItemProps, type NSEStackViewProps } from "./stackViewTypes";

const crossAxis: Record<Exclude<NSEStackAlignment, "leading">, CSSProperties["alignItems"]> = {
  fill: "stretch",
  centre: "center",
  trailing: "flex-end",
  "first-baseline": "baseline",
  "last-baseline": "last baseline",
};

function hasArrangedLayout(item: NSEStackItemProps): boolean {
  return item.minimumSize !== undefined || item.preferredSize !== undefined || item.maximumSize !== undefined
    || item.weight !== undefined || item.gravity !== undefined || item.spacingAfter !== undefined
    || (item.visibilityPriority !== undefined && item.visibilityPriority < NSEStackVisibilityPriority.mustHold);
}

/**
 * Whether a stack must be laid out by measurement: when it is given a size,
 * distributes by proportion, centring or gravity areas, or holds an item with
 * its own sizes, weight, gravity, custom spacing or a visibility priority
 * below mustHold. Every other stack is laid out by the browser's flexbox,
 * which gives the same frames without measuring.
 *
 * @internal
 */
export function stackNeedsArrangedLayout(props: NSEStackViewProps): boolean {
  if (props.availableSize !== undefined || props.resizeObserverFactory !== undefined || props.frameScheduler !== undefined) return true;
  if (props.distribution !== undefined && props.distribution !== "fill" && props.distribution !== "equal-spacing") return true;
  return Children.toArray(props.children).some((child) => isValidElement(child) && child.type === NSEStackItem && hasArrangedLayout(child.props as NSEStackItemProps));
}

/**
 * An NSEStackView laid out by flexbox. Hidden items stay mounted but take no
 * space, as an NSStackView with detachesHiddenViews.
 *
 * @internal
 */
export function NSEFlowStackView({
  orientation = "horizontal",
  distribution = "fill",
  alignment,
  spacing,
  edgeInsets,
  overflowPolicy,
  availableSize: _availableSize,
  overflowLabel: _overflowLabel,
  resizeObserverFactory: _resizeObserverFactory,
  frameScheduler: _frameScheduler,
  reducedMotion: _reducedMotion,
  onOverflowChange: _onOverflowChange,
  className = "",
  style,
  children,
  ...props
}: NSEStackViewProps) {
  const vertical = orientation === "vertical";
  const resolvedAlignment = alignment ?? (vertical ? "fill" : "centre");
  const wraps = overflowPolicy === "wrap";
  const flowStyle: CSSProperties = {
    display: "flex",
    flexDirection: vertical ? "column" : "row",
    flexWrap: wraps ? "wrap" : "nowrap",
    alignItems: resolvedAlignment === "leading" ? (vertical ? undefined : "flex-start") : crossAxis[resolvedAlignment],
    justifyContent: distribution === "equal-spacing" ? "space-between" : undefined,
    gap: resolveNSESpacing(spacing ?? (vertical ? "standard" : "inline")),
    paddingInlineStart: edgeInsets?.inlineStart,
    paddingInlineEnd: edgeInsets?.inlineEnd,
    paddingBlockStart: edgeInsets?.blockStart,
    paddingBlockEnd: edgeInsets?.blockEnd,
    ...style,
  };
  const items = Children.map(children, (child: ReactNode) => {
    if (!isValidElement(child) || child.type !== NSEStackItem) return child;
    const item = (child as ReactElement<NSEStackItemProps>).props;
    return <div key={child.key ?? item.id} data-stack-item-id={item.id} hidden={item.hidden || undefined} style={item.hidden ? undefined : { display: "contents" }}>{item.children}</div>;
  });
  return (
    <div
      {...props}
      className={["nse-layout-flex", vertical ? "nse-layout-stack" : "nse-layout-inline", className].filter(Boolean).join(" ")}
      data-nse-control="stack-view" data-nse-part="content" data-nse-orientation={orientation} data-nse-alignment={resolvedAlignment}
      data-nse-layout={vertical ? "stack" : "inline"}
      data-direction={vertical ? "column" : "row"}
      data-wrap={wraps ? "wrap" : "nowrap"}
      data-orientation={orientation}
      data-alignment={vertical ? resolvedAlignment : undefined}
      // A leading column is a content stack: controls keep their natural size
      // and flexible views fill (nse-layout-defaults.css).
      data-nse-content-layout={vertical && resolvedAlignment === "leading" ? "stack" : undefined}
      style={flowStyle}
    >
      {items}
    </div>
  );
}
