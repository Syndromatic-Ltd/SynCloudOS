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

import { createElement, type HTMLAttributes } from "react";

/** SwiftUI's text styles, sized by the SDK's text tokens so every theme agrees. */
export type NSETextStyle = "body" | "callout" | "footnote" | "caption" | "headline" | "label";

export interface NSETextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div" | "output" | "strong" | "small" | "h2" | "h3" | "h4";
  textStyle?: NSETextStyle;
  /** `secondary` is the quieter ink for readouts, hints and metadata. */
  tone?: "primary" | "secondary";
  /** Tabular figures, so changing numbers do not jitter. */
  numeric?: boolean;
  /** Lets long unbroken strings (paths, URLs, hex values) wrap anywhere. */
  wrap?: "normal" | "anywhere";
}

/**
 * Text in one of the SDK's styles. Use it for readouts, captions and notes
 * beside controls instead of hand-sizing paragraphs; the style keeps text
 * quieter than the controls it describes.
 */
export function NSEText({ as = "p", textStyle = "body", tone = "primary", numeric = false, wrap = "normal", className = "", children, ...props }: NSETextProps) {
  return createElement(
    as,
    {
      ...props,
      className: ["nse-text", className].filter(Boolean).join(" "),
      "data-text-style": textStyle,
      "data-tone": tone === "secondary" ? "secondary" : undefined,
      "data-numeric": numeric ? "true" : undefined,
      "data-wrap": wrap === "anywhere" ? "anywhere" : undefined,
    },
    children,
  );
}
