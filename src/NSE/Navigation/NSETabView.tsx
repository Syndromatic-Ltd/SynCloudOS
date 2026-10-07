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

import type { ReactNode } from "react";

import type { NSETabViewProps } from "./navigationTypes";
import { NSETabStrip } from "./tabStrip";

export function NSETabView(props: NSETabViewProps) {
  return (
    <section data-nse-control="tab-view" data-appearance-recipe="tab-view" data-tab-style={props.presentation?.tabStyle ?? "capsule"}>
      <NSETabStrip
        aria-label={props["aria-label"]}
        items={props.items}
        tone={props.tone}
        selectedId={props.selectedId}
        defaultSelectedId={props.defaultSelectedId}
        maximumVisibleTabs={props.maximumVisibleTabs}
        parentResponderId={props.parentResponderId}
        panelIdentity
        presentation={props.presentation}
        onSelectedIdChange={props.onSelectedIdChange}
        onRequestClose={props.onRequestClose}
        onRequestReorder={props.onRequestReorder}
      >
        {({ instanceId, enabled, selected }) => {
          const enabledIds = new Set(enabled.map((item) => item.id));
          const panels = props.items.filter((item) => {
            if (item.ownsPanel === false || !enabledIds.has(item.id)) return false;
            return props.keepAlive || item.id === selected?.id;
          });
          return panels.map((item): ReactNode => (
            <div
              key={item.id}
              role="tabpanel"
              id={item.panelId ?? `tab-panel-${instanceId}-${item.id}`}
              aria-labelledby={`tab-${instanceId}-${item.id}`}
              hidden={item.id !== selected?.id}
              data-restoration-id={item.restorationId ?? item.id}
              data-nse-content-layout="stack"
            >
              {item.render()}
            </div>
          ));
        }}
      </NSETabStrip>
    </section>
  );
}
