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

import { createElement, useId } from "react";

import type { NSEAccordionViewProps } from "./navigationTypes";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export function NSEAccordionView(props: NSEAccordionViewProps) {
  const instanceId = useId().replace(/:/g, "");
  const toggle = (id: string) => {
    const wasExpanded = props.expandedIds.has(id);
    const next = props.mode === "single" ? new Set<string>() : new Set(props.expandedIds);
    if (wasExpanded) next.delete(id);
    else next.add(id);

    props.onExpandedIdsChange(next);
  };

  const headingTag = `h${Math.min(6, Math.max(1, props.headingLevel ?? 3))}` as HeadingTag;

  return (
    <section aria-label={props["aria-label"]} data-nse-control="accordion-view">
      {props.items.map((item) => {
        const expanded = props.expandedIds.has(item.id);
        const button = (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`accordion-panel-${instanceId}-${item.id}`}
            disabled={item.disabled}
            onClick={() => toggle(item.id)}
          >
            {item.label}
          </button>
        );

        return (
          <div key={item.id}>
            {createElement(headingTag, null, button)}
            {expanded ? (
              <div id={`accordion-panel-${instanceId}-${item.id}`} role="region" aria-label={item.label} data-nse-content-layout="stack">
                {item.render()}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
