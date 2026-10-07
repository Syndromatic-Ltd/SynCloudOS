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

import {
  Children,
  createElement,
  isValidElement,
  useMemo,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode
} from "react";

type NSEStyleVars = CSSProperties & { [key: `--nse-${string}`]: string | number | undefined };

export type NSELayoutElement =
  | "div"
  | "section"
  | "main"
  | "nav"
  | "aside"
  | "header"
  | "footer"
  | "span"
  | "ol"
  | "ul";

export type NSEFlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type NSEFlexWrap = boolean | "nowrap" | "wrap" | "wrap-reverse";
export type NSEFlexAlign = CSSProperties["alignItems"];
export type NSEFlexJustify = CSSProperties["justifyContent"];
/**
 * A named step of the SDK's spacing (see nse-layout-defaults.css), so a
 * layout follows the theme's rhythm instead of hard-coding pixels:
 * `tight` (a control and its caption), `standard` (sibling controls),
 * `inline` (controls side by side, such as a row of buttons), `related`
 * (stacked groups of related controls), `group` (unrelated groups).
 */
export type NSESpacing = "none" | "tight" | "standard" | "inline" | "related" | "group";
export type NSELayoutGap = NSESpacing | number | string;
/** UIStackView's alignments. `leading` keeps controls at their natural size and lets flexible views fill. */
export type NSEStackContentAlignment = "fill" | "leading" | "center" | "trailing";

const spacingTokens: Record<NSESpacing, string> = {
  none: "0px",
  tight: "var(--nse-spacing-tight)",
  standard: "var(--nse-spacing-standard)",
  inline: "var(--nse-spacing-inline)",
  related: "var(--nse-spacing-related)",
  group: "var(--nse-spacing-group)",
};

/** Resolves a gap to CSS: a named spacing, a pixel number or any CSS length. */
export function resolveNSESpacing(value: NSELayoutGap | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return `${value}px`;
  return value in spacingTokens ? spacingTokens[value as NSESpacing] : value;
}

export interface NSEFlexProps extends HTMLAttributes<HTMLElement> {
  as?: NSELayoutElement;
  direction?: NSEFlexDirection;
  wrap?: NSEFlexWrap;
  align?: NSEFlexAlign;
  justify?: NSEFlexJustify;
  gap?: NSELayoutGap;
  rowGap?: NSELayoutGap;
  columnGap?: NSELayoutGap;
  inline?: boolean;
  fill?: boolean;
  grow?: number;
  shrink?: number;
  basis?: number | string;
}

export interface NSEStackProps extends Omit<NSEFlexProps, "direction" | "inline" | "wrap"> {
  dividers?: boolean;
  /**
   * How children sit across the column. `fill` (the default) stretches every
   * child; `leading` keeps controls at their natural size while fields,
   * sliders, lists and other flexible views still fill, as a Mac form does.
   * An explicit `align` wins.
   */
  alignment?: NSEStackContentAlignment;
}

export interface NSEInlineProps extends Omit<NSEFlexProps, "direction" | "inline"> {
  scroll?: boolean;
}

export interface NSEFitProps extends HTMLAttributes<HTMLElement> {
  as?: NSELayoutElement;
  mode?: "fill" | "contain" | "cover" | "center" | "stretch";
  aspectRatio?: number | string;
  scroll?: boolean;
  center?: boolean;
}

export interface NSESpacerProps extends HTMLAttributes<HTMLSpanElement> {
  axis?: "inline" | "block" | "both";
  size?: number | string;
  grow?: number;
  shrink?: number;
  min?: number | string;
}

export interface NSEOrderedChildRecord {
  key: string;
  index: number;
  order: number;
  node: ReactNode;
}

export interface NSEOrderedChildrenOptions {
  descending?: boolean;
  includeHidden?: boolean;
  getOrder?: (child: ReactNode, index: number) => number | null | undefined;
}

export interface NSEOrderedProps extends HTMLAttributes<HTMLElement>, NSEOrderedChildrenOptions {
  as?: NSELayoutElement;
  axis?: "vertical" | "horizontal";
  gap?: NSELayoutGap;
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function cssLength(value: number | string | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

const cssGap = resolveNSESpacing;

function flexWrapValue(wrap: NSEFlexWrap) {
  if (wrap === true) return "wrap";
  if (wrap === false) return "nowrap";
  return wrap;
}

function readNumericOrder(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getElementOrder(child: ReactNode, index: number, getOrder?: NSEOrderedChildrenOptions["getOrder"]) {
  const explicitOrder = getOrder?.(child, index);
  const parsedExplicitOrder = readNumericOrder(explicitOrder);
  if (parsedExplicitOrder !== undefined) return parsedExplicitOrder;

  if (!isValidElement(child)) return index;

  const props = (child as ReactElement<Record<string, unknown>>).props;
  return readNumericOrder(props.nseOrder)
    ?? readNumericOrder(props.order)
    ?? readNumericOrder(props["data-nse-order"])
    ?? readNumericOrder(props["data-order"])
    ?? index;
}

function isHiddenChild(child: ReactNode) {
  if (!isValidElement(child)) return false;
  const props = (child as ReactElement<Record<string, unknown>>).props;
  return props.hidden === true || props["aria-hidden"] === true || props["aria-hidden"] === "true";
}

function orderedPosition(index: number, total: number) {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

export function useNSEOrderedChildren(children: ReactNode, options: NSEOrderedChildrenOptions = {}) {
  const { descending = false, includeHidden = false, getOrder } = options;

  return useMemo(() => {
    const records = Children.toArray(children)
      .map((child, index) => ({
        key: isValidElement(child) && child.key != null ? String(child.key) : `nse-ordered-${index}`,
        index,
        order: getElementOrder(child, index, getOrder),
        node: child
      }))
      .filter((record) => includeHidden || !isHiddenChild(record.node))
      .sort((left, right) => {
        const delta = left.order - right.order;
        if (delta !== 0) return descending ? -delta : delta;
        return left.index - right.index;
      });

    return records;
  }, [children, descending, getOrder, includeHidden]);
}

export function NSEFlex({
  as = "div",
  direction = "row",
  wrap = "nowrap",
  align,
  justify,
  gap,
  rowGap,
  columnGap,
  inline = false,
  fill = false,
  grow,
  shrink,
  basis,
  className = "",
  style,
  children,
  ...props
}: NSEFlexProps) {
  const layoutName = (props as Record<string, unknown>)["data-nse-layout"] as string | undefined;
  // Only the gap keys that have values. React writes an undefined style
  // value as "", and clearing row-gap or column-gap after `gap` erases the
  // shorthand too: every NSEStack and NSEInline used to render with no gap.
  const gapStyle: CSSProperties = {};
  if (gap !== undefined) gapStyle.gap = cssGap(gap);
  if (rowGap !== undefined) gapStyle.rowGap = cssGap(rowGap);
  if (columnGap !== undefined) gapStyle.columnGap = cssGap(columnGap);
  const flexStyle: CSSProperties = {
    display: inline ? "inline-flex" : "flex",
    flexDirection: direction,
    flexWrap: flexWrapValue(wrap),
    alignItems: align,
    justifyContent: justify,
    ...gapStyle,
    flexGrow: grow,
    flexShrink: shrink,
    flexBasis: cssLength(basis),
    minWidth: fill ? 0 : undefined,
    width: fill ? "100%" : undefined,
    ...style
  };

  return createElement(
    as,
    {
      ...props,
      className: classes("nse-layout-flex", className),
      "data-nse-layout": layoutName ?? (inline ? "inline-flex" : "flex"),
      "data-direction": direction,
      "data-wrap": flexWrapValue(wrap),
      "data-inline": inline ? "true" : "false",
      "data-fill": fill ? "true" : "false",
      style: flexStyle
    },
    children
  );
}

const stackAlign: Record<NSEStackContentAlignment, NSEFlexAlign> = {
  fill: "stretch",
  leading: undefined,
  center: "center",
  trailing: "flex-end",
};

export function NSEStack({
  as = "div",
  gap = "standard",
  alignment = "fill",
  align = stackAlign[alignment],
  justify,
  dividers = false,
  className = "",
  children,
  ...props
}: NSEStackProps) {
  const stackChildren = dividers
    ? Children.toArray(children).flatMap((child, index) => (
        index === 0
          ? [child]
          : [
              <span key={`nse-stack-divider-${index}`} className="nse-layout-stack-divider" role="separator" />,
              child
            ]
      ))
    : children;

  return (
    <NSEFlex
      {...props}
      as={as}
      className={classes("nse-layout-stack", className)}
      data-nse-layout="stack"
      data-alignment={alignment}
      // A leading stack is a content stack: controls keep their natural size
      // and flexible views fill (nse-layout-defaults.css).
      data-nse-content-layout={alignment === "leading" ? "stack" : undefined}
      direction="column"
      gap={dividers ? 0 : gap}
      align={align}
      justify={justify}
    >
      {stackChildren}
    </NSEFlex>
  );
}

export function NSEInline({
  as = "div",
  wrap = true,
  align = "center",
  gap = "inline",
  scroll = false,
  className = "",
  children,
  ...props
}: NSEInlineProps) {
  return (
    <NSEFlex
      {...props}
      as={as}
      className={classes("nse-layout-inline", scroll && "is-scrollable", className)}
      data-nse-layout="inline"
      direction="row"
      wrap={scroll ? "nowrap" : wrap}
      align={align}
      gap={gap}
      data-scroll={scroll ? "true" : "false"}
    >
      {children}
    </NSEFlex>
  );
}

export function NSEFit({
  as = "div",
  mode = "fill",
  aspectRatio,
  scroll = false,
  center = true,
  className = "",
  style,
  children,
  ...props
}: NSEFitProps) {
  const fitStyle = {
    "--nse-fit-aspect-ratio": aspectRatio === undefined ? undefined : String(aspectRatio),
    aspectRatio,
    ...style
  } as NSEStyleVars;

  return createElement(
    as,
    {
      ...props,
      className: classes("nse-layout-fit", center && "is-centered", className),
      "data-nse-layout": "fit",
      "data-mode": mode,
      "data-scroll": scroll ? "true" : "false",
      style: fitStyle
    },
    children
  );
}

export function NSESpacer({
  axis = "inline",
  size,
  grow = size === undefined ? 1 : 0,
  shrink = 1,
  min,
  className = "",
  style,
  ...props
}: NSESpacerProps) {
  const inlineSize = axis === "inline" || axis === "both" ? cssLength(size) : undefined;
  const blockSize = axis === "block" || axis === "both" ? cssLength(size) : undefined;
  const spacerStyle: CSSProperties = {
    flexGrow: grow,
    flexShrink: shrink,
    flexBasis: inlineSize ?? blockSize ?? "auto",
    inlineSize,
    blockSize,
    minInlineSize: axis !== "block" ? cssLength(min) : undefined,
    minBlockSize: axis !== "inline" ? cssLength(min) : undefined,
    ...style
  };

  return (
    <span
      {...props}
      className={classes("nse-layout-spacer", className)}
      data-nse-layout="spacer"
      data-axis={axis}
      aria-hidden="true"
      style={spacerStyle}
    />
  );
}

export function NSEOrdered({
  as = "div",
  axis = "vertical",
  gap = 0,
  descending = false,
  includeHidden = false,
  getOrder,
  className = "",
  style,
  children,
  ...props
}: NSEOrderedProps) {
  const records = useNSEOrderedChildren(children, { descending, includeHidden, getOrder });
  const orderedStyle: CSSProperties = {
    display: "flex",
    flexDirection: axis === "vertical" ? "column" : "row",
    gap: cssGap(gap),
    ...style
  };

  return createElement(
    as,
    {
      ...props,
      className: classes("nse-layout-ordered", className),
      "data-nse-layout": "ordered",
      "data-axis": axis,
      "data-descending": descending ? "true" : "false",
      style: orderedStyle
    },
    records.map((record, index) => (
      <span
        key={record.key}
        className="nse-layout-ordered-item"
        data-nse-order={orderedPosition(index, records.length)}
        data-nse-sort-order={record.order}
        data-source-index={record.index}
      >
        {record.node}
      </span>
    ))
  );
}
