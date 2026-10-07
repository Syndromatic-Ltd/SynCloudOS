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

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import {
  NSEPresence,
  useNSEAnimationEnvironment,
  useNSEPresentation,
  type NSEPresentationSpec,
  type NSETransformComponents,
} from "../NSE/Animation";
import type { AFXAnimationTiming } from "../FX/AnimationFX/animationTypes";
import { WebspringIconEffect } from "./WebspringIconEffect";
import { Badge, IconWell, LoadingSpinner } from "../NSE/NSE";
import { useNSEFeedback } from "../NSE/hostComposition";
import type { SynCloudOSAppInfo, SynCloudOSAppLifecycleState } from "../SynCloudOS/SynCloudOS";
import { FocusScope, useKernelSynCloudOS } from "../SynCloudOSReact";
import { WebspringIconArtwork } from "./WebspringIconArtwork";
import {
  getQuickSwitchInitialIndex,
  getQuickSwitchMnemonic,
  fitQuickSwitch,
  isQuickSwitchOpenedApp,
  moveQuickSwitchSelection,
  normalizeQuickSwitchKey,
  selectQuickSwitchMnemonicIndex
} from "./quickswitchModel";
import { useWebspringLocale } from "./webspringLocale";

const quickSwitchEase: AFXAnimationTiming = Object.freeze({ kind: "cubic-bezier", x1: 0.22, y1: 1, x2: 0.36, y2: 1 });
const quickSwitchPresentation = (opacity: readonly [number, number],
  transform?: readonly [NSETransformComponents, NSETransformComponents]): NSEPresentationSpec => Object.freeze({
  duration: 0.18,
  timing: quickSwitchEase,
  tracks: Object.freeze([
    Object.freeze({ keyPath: "opacity" as const, values: Object.freeze(opacity) }),
    ...(transform ? [Object.freeze({ keyPath: "transform" as const, values: Object.freeze(transform) })] : []),
  ]),
});
/** The strip drops in and lifts away; reduced motion only fades it. */
const quickSwitchMotion = Object.freeze({
  standard: Object.freeze({
    enter: quickSwitchPresentation([0, 1], [{ y: -14, scale: 0.985 }, {}]),
    exit: quickSwitchPresentation([1, 0], [{}, { y: -10, scale: 0.99 }]),
  }),
  reduced: Object.freeze({
    enter: quickSwitchPresentation([0, 1]),
    exit: quickSwitchPresentation([1, 0]),
  }),
});

export interface WebspringQuickSwitchViewProps {
  activeAppId?: string | null;
  apps: readonly SynCloudOSAppInfo[];
  lifecycle: Record<string, SynCloudOSAppLifecycleState>;
  onClose: () => void;
  open: boolean;
  openAppIds: readonly string[];
  selectedAppId?: string | null;
  /** What happens once the frame has grown to the screen edge. Defaults to `shrink`. */
  overflow?: "shrink" | "scroll";
}

function appKey(apps: readonly SynCloudOSAppInfo[]) {
  return apps.map((app) => app.id).join("\u0001");
}

function isLoadingState(state: SynCloudOSAppLifecycleState | undefined) {
  return state === "loading" || state === "launching";
}

export function WebspringQuickSwitchView({
  activeAppId = null,
  apps,
  lifecycle,
  onClose,
  open,
  openAppIds,
  overflow = "shrink",
  selectedAppId = null
}: WebspringQuickSwitchViewProps) {
  const feedback = useNSEFeedback();

  const quickSwitchId = useId();
  const runtime = useKernelSynCloudOS();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const locale = useWebspringLocale();
  const appsSignature = useMemo(() => appKey(apps), [apps]);
  const isSelectable = useCallback(
    (app: { id: string; isDisabled?: boolean }) => !app.isDisabled && lifecycle[app.id] !== "disabled",
    [lifecycle]
  );
  const selectableIndices = useMemo(
    () => apps
      .map((app, index) => (isSelectable(app) ? index : -1))
      .filter((index) => index >= 0),
    [apps, isSelectable]
  );
  const activeOptionId = selectedIndex >= 0 && apps[selectedIndex]
    ? `${quickSwitchId}-${apps[selectedIndex].id}`
    : undefined;

  useLayoutEffect(() => {
    if (!open) return;
    setSelectedIndex(getQuickSwitchInitialIndex(apps, selectedAppId, activeAppId, isSelectable));
  }, [activeAppId, apps, appsSignature, isSelectable, open, selectedAppId]);

  // Hover selects but never scrolls: the row moving under the pointer would select its neighbour.
  const pointerSelectionRef = useRef(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const selected = itemRefs.current[selectedIndex];
    selected?.focus?.({ preventScroll: true });
    if (pointerSelectionRef.current) {
      pointerSelectionRef.current = false;
      return;
    }
    selected?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [open, selectedIndex]);

  // The frame grows with its icons up to the screen edge. Past it, `shrink` scales every icon slot,
  // gap and artwork by one fit factor, keeping the frame padding, and `scroll` scrolls the row.
  // Both are judged from the icon slots, never scrollWidth: a shell's icon effect may paint any
  // distance, and its glow must not make the row scrollable. Only a scrolling row fades its ends.
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const view = root.ownerDocument.defaultView;
    if (!view) return;
    const measure = () => {
      const style = view.getComputedStyle(root);
      const length = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
      const result = fitQuickSwitch({
        count: apps.length,
        iconSize: length("--webspring-quickswitch-icon-size"),
        iconGap: length("--webspring-quickswitch-icon-gap"),
        room: root.ownerDocument.documentElement.clientWidth
          - 2 * length("--webspring-quickswitch-screen-inset") - 2 * length("--webspring-quickswitch-inner-padding"),
        overflow,
      });
      setFit(result.fit);
      setOverflowing(result.overflowing);
    };
    measure();
    if (!view.ResizeObserver) return;
    const observer = new view.ResizeObserver(measure);
    observer.observe(root.ownerDocument.documentElement);
    return () => observer.disconnect();
  }, [apps.length, open, overflow]);

  const commit = useCallback((index: number) => {
    const app = apps[index];
    if (!app || app.isDisabled || lifecycle[app.id] === "disabled") return;
    feedback?.trigger("medium");
    onClose();
    void runtime.commands.dispatch("workspace.openApp", { appId: app.id }, { source: "keyboard" });
  }, [apps, lifecycle, onClose, runtime]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        feedback?.trigger("selection");
        return;
      }

      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        event.stopPropagation();
        commit(selectedIndex);
        return;
      }

      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((current) => moveQuickSwitchSelection(current, apps.length, event.key, selectableIndices));
        feedback?.trigger("selection");
        return;
      }

      const mnemonic = !event.altKey && !event.ctrlKey && !event.metaKey
        ? normalizeQuickSwitchKey(event.key)
        : null;
      if (!mnemonic) return;

      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex((current) => selectQuickSwitchMnemonicIndex(apps, mnemonic, current, isSelectable));
      feedback?.trigger("selection");
  }, [apps, commit, isSelectable, onClose, selectableIndices, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node | null)) return;
      if (event.target instanceof Element && event.target.closest(".nse-app-topbar-title-button")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    return runtime.environment.addWindowListener("pointerdown", handleOutsidePointerDown, { capture: true });
  }, [onClose, open, runtime]);

  function openApp(index: number) {
    const app = apps[index];
    if (!app || app.isDisabled || lifecycle[app.id] === "disabled") return;
    feedback?.trigger("medium");
    onClose();
    void runtime.commands.dispatch("workspace.openApp", { appId: app.id }, { source: "menu" });
  }

  return (
    <NSEPresence>
      {open ? (
        <FocusScope scopeId={`quickswitch:${quickSwitchId}`} kind="popover" parentResponderId="webspring">
        <QuickSwitchSurface
          surfaceRef={rootRef}
          motion={reducedMotion ? quickSwitchMotion.reduced : quickSwitchMotion.standard}
          className="webspring-quickswitch"
          role="dialog"
          aria-label={locale.t("quickswitch.ariaLabel", "QuickSwitch")}
          aria-modal="false"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
          style={{ ["--webspring-quickswitch-items" as string]: apps.length, ["--webspring-quickswitch-fit" as string]: fit }}
          data-overflow={overflow}
        >
          <div className="webspring-quickswitch-strip" aria-hidden="true">
            <span className="webspring-quickswitch-cap webspring-quickswitch-cap-left" />
            <span className="webspring-quickswitch-middle" />
            <span className="webspring-quickswitch-cap webspring-quickswitch-cap-right" />
          </div>
          <div
            className="webspring-quickswitch-items"
            role="listbox"
            aria-label={locale.t("quickswitch.visibleApps", "Visible Webspring apps")}
            aria-activedescendant={activeOptionId}
            tabIndex={0}
            ref={listRef}
            data-overflowing={overflowing ? "true" : undefined}
          >
            {apps.map((app, index) => {
              const state = lifecycle[app.id];
              const selected = index === selectedIndex;
              const opened = isQuickSwitchOpenedApp(app.id, { activeAppId, lifecycle, openAppIds });
              const active = activeAppId === app.id;
              const mnemonic = getQuickSwitchMnemonic(app);
              const loading = isLoadingState(state);
              const appName = locale.appName(app);

              return (
                <button
                  type="button"
                  key={app.id}
                  id={`${quickSwitchId}-${app.id}`}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  className={`webspring-quickswitch-item ${selected ? "is-selected" : ""} ${opened ? "is-opened" : ""} ${active ? "is-active-app" : ""} ${loading ? "is-loading" : ""}`}
                  role="option"
                  aria-selected={selected}
                  aria-label={locale.t(
                    opened ? "quickswitch.openedShortcut" : "quickswitch.notOpenedShortcut",
                    opened ? "{app}, opened, {shortcut} shortcut" : "{app}, not opened, {shortcut} shortcut",
                    { app: appName, shortcut: mnemonic }
                  )}
                  aria-keyshortcuts={mnemonic}
                  data-mnemonic={mnemonic}
                  data-opened={opened ? "true" : "false"}
                  data-active-app={active ? "true" : "false"}
                  disabled={app.isDisabled || state === "disabled"}
                  onPointerEnter={() => {
                    if (index === selectedIndex) return;
                    pointerSelectionRef.current = true;
                    setSelectedIndex(index);
                  }}
                  onFocus={() => {
                    setSelectedIndex(index);
                  }}
                  onClick={() => openApp(index)}
                >
                  <IconWell active={selected}>
                    <WebspringIconEffect active={selected || opened} subtle={!selected} className="webspring-quickswitch-icon-effect" />
                    <WebspringIconArtwork src={app.icon.src} />
                    {loading ? (
                      <LoadingSpinner
                        label={locale.t("apps.loading", "Loading {app}", { app: appName })}
                        variant="dark"
                      />
                    ) : null}
                    <Badge count={app.notifications.badgeCount} />
                  </IconWell>
                </button>
              );
            })}
          </div>
        </QuickSwitchSurface>
        </FocusScope>
      ) : null}
    </NSEPresence>
  );
}

function QuickSwitchSurface({ surfaceRef, motion, ...props }: ComponentProps<"div"> & {
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  readonly motion: Readonly<{ enter: NSEPresentationSpec; exit: NSEPresentationSpec }>;
}) {
  useNSEPresentation(surfaceRef, motion);
  return <div ref={surfaceRef} {...props} />;
}
