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

import { useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { NSEDivider, NSEListItem } from "../../Controls/Selection";
import { useNSEVisualEnvironment } from "../../Appearance";
import { useNSERubberBandScroll } from "../../Scroll";
import type { NSEChromeScheme } from "../../Windows/Chrome/nseTopBarTypes";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type NSESidebarVariant = "sourceList" | "inspector" | "plain";
/** Surface skin. `metal` paints the brushed-metal source-list rail (grain, seam shadow, embossed
 *  section labels) to sit under the `atmoMetal` chrome; `plain` is the default light gradient. */
export type NSESidebarSurface = "plain" | "metal";

export interface NSESidebarItem {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  ariaControls?: string;
  secondaryText?: ReactNode;
  icon?: ReactNode;
  glyph?: string;
  glyphFramed?: boolean;
  glyphSize?: "standard" | "large";
  badge?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  children?: NSESidebarItem[];
}

export interface NSESidebarSection {
  id: string;
  label?: ReactNode;
  /** Semantic source-list projection marker. Existing physical callers leave this unset. */
  navigationGroupId?: string;
  toggleLabel?: string;
  items: NSESidebarItem[];
  collapsed?: boolean;
}

export interface NSESidebarProps extends Omit<HTMLAttributes<HTMLElement>, "onSelect"> {
  /** Floating controls (such as search) inside the row scroll surface. The sidebar
   * owns their placement and material; rows scroll beneath this transparent slot. */
  header?: ReactNode;
  variant?: NSESidebarVariant;
  surface?: NSESidebarSurface;
  scheme?: NSEChromeScheme;
  sections: NSESidebarSection[];
  activeItemId?: string | null;
  /** Controlled collapse state. Omit to let the sidebar handle its arrows. */
  collapsedSectionIds?: readonly string[];
  onSelectItem?: (item: NSESidebarItem, section: NSESidebarSection) => void;
  onToggleSection?: (section: NSESidebarSection) => void;
  renderItem?: (item: NSESidebarItem, state: { selected: boolean; section: NSESidebarSection }) => ReactNode;
}

function NSESidebarGlyph({ item }: { item: NSESidebarItem }) {
  if (item.icon) return <span className="nse-sidebar-item-icon">{item.icon}</span>;
  if (!item.glyph) return null;
  return (
    <span
      className={classes(
        "nse-sidebar-item-glyph",
        item.glyphFramed && "nse-sidebar-item-glyph-framed",
        item.glyphSize === "large" && "nse-sidebar-item-glyph-large",
      )}
      style={{ backgroundImage: `url("${item.glyph}")` }}
      aria-hidden="true"
    />
  );
}

function SidebarRow({
  item,
  section,
  selected,
  level = 0,
  onSelectItem,
  renderItem
}: {
  item: NSESidebarItem;
  section: NSESidebarSection;
  selected: boolean;
  level?: number;
  onSelectItem?: (item: NSESidebarItem, section: NSESidebarSection) => void;
  renderItem?: NSESidebarProps["renderItem"];
}) {
  if (renderItem) return <>{renderItem(item, { selected, section })}</>;

  return (
    <NSEListItem
      className="nse-sidebar-row"
      selected={selected}
      disabled={item.disabled}
      role="button"
      tabIndex={item.disabled ? -1 : 0}
      data-nse-sidebar-row="true"
      data-level={level}
      aria-label={item.ariaLabel}
      aria-selected={selected}
      aria-current={selected ? "true" : undefined}
      aria-controls={item.ariaControls}
      leading={<NSESidebarGlyph item={item} />}
      meta={item.meta ?? item.secondaryText}
      trailing={item.badge ?? item.status}
      onClick={() => {
        if (!item.disabled) onSelectItem?.(item, section);
      }}
      onKeyDown={(event) => {
        if (item.disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectItem?.(item, section);
        }
      }}
    >
      {item.label}
    </NSEListItem>
  );
}

function renderRows({
  items,
  section,
  activeItemId,
  onSelectItem,
  renderItem,
  level = 0
}: {
  items: NSESidebarItem[];
  section: NSESidebarSection;
  activeItemId: string | null;
  onSelectItem?: (item: NSESidebarItem, section: NSESidebarSection) => void;
  renderItem?: NSESidebarProps["renderItem"];
  level?: number;
}) {
  return items.map((item) => (
    <div className="nse-sidebar-item-node" key={item.id} data-level={level}>
      <SidebarRow
        item={item}
        section={section}
        level={level}
        selected={item.selected ?? activeItemId === item.id}
        onSelectItem={onSelectItem}
        renderItem={renderItem}
      />
      {item.children?.length ? (
        <div className="nse-sidebar-item-children">
          {renderRows({ items: item.children, section, activeItemId, onSelectItem, renderItem, level: level + 1 })}
        </div>
      ) : null}
    </div>
  ));
}

function handleSidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || (event.target instanceof Element && event.target.closest(".nse-sidebar-header"))) return;
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-nse-sidebar-row='true']:not([aria-disabled='true'])"))
    .filter((row) => !row.closest("[inert], [hidden]"));
  if (rows.length === 0) return;

  const currentIndex = rows.indexOf(event.target as HTMLElement);
  const fallbackIndex = rows.findIndex((row) => row.getAttribute("aria-current") === "true");
  const index = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? rows.length - 1
      : event.key === "ArrowDown"
        ? Math.min(rows.length - 1, index + 1)
        : Math.max(0, index - 1);

  event.preventDefault();
  rows[nextIndex]?.focus();
}

export function NSESidebar({
  header,
  variant = "sourceList",
  surface = "plain",
  scheme,
  sections,
  activeItemId = null,
  collapsedSectionIds,
  onSelectItem,
  onToggleSection,
  renderItem,
  className = "",
  ...props
}: NSESidebarProps) {
  const appearance = useNSEVisualEnvironment();
  const resolvedScheme = scheme ?? appearance.resolvedAppearance;
  const [internalCollapsedIds, setInternalCollapsedIds] = useState<readonly string[]>([]);
  const collapsedIds = collapsedSectionIds ?? internalCollapsedIds;
  const toggleSection = (section: NSESidebarSection) => {
    if (collapsedSectionIds === undefined && section.collapsed === undefined) {
      setInternalCollapsedIds(ids => ids.includes(section.id) ? ids.filter(id => id !== section.id) : [...ids, section.id]);
    }
    onToggleSection?.(section);
  };
  const scrollRef = useRef<HTMLElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  // iOS-style rubber-band overscroll: the inner content is translated, clipped by the scroll box.
  useNSERubberBandScroll(scrollRef, scrollContentRef);
  return (
    <aside
      className={classes("nse-sidebar", className)}
      data-variant={variant}
      data-surface={surface}
      data-mode={resolvedScheme}
      {...props}
    >
      <nav className="nse-sidebar-scroll" ref={scrollRef} onKeyDown={handleSidebarKeyDown}>
        {header != null ? <div className="nse-sidebar-header">{header}</div> : null}
        <div className="nse-sidebar-scroll-content" ref={scrollContentRef}>
        {sections.map((section) => {
          const collapsed = section.collapsed ?? collapsedIds.includes(section.id);
          return (
            <section
              className="nse-sidebar-section"
              key={section.id}
              data-collapsed={collapsed ? "true" : "false"}
              data-navigation-group={section.navigationGroupId}
            >
              {section.label ? (
                <div className="nse-sidebar-section-header">
                  <span className="nse-sidebar-section-label">{section.label}</span>
                  <span className="nse-sidebar-section-line" aria-hidden="true" />
                  <NSEDivider
                    variant="arrow"
                    className="nse-sidebar-section-toggle"
                    expanded={!collapsed}
                    onToggle={() => toggleSection(section)}
                    label={section.toggleLabel ?? "Toggle sidebar section"}
                  />
                </div>
              ) : null}
              <div
                className="nse-sidebar-section-items"
                data-collapsed={collapsed ? "true" : "false"}
                inert={collapsed}
              >
                <div className="nse-sidebar-section-items-inner">
                  {renderRows({ items: section.items, section, activeItemId, onSelectItem, renderItem })}
                </div>
              </div>
            </section>
          );
        })}
        </div>
      </nav>
    </aside>
  );
}
