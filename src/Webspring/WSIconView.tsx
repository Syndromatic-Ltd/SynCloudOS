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

import { useCallback, useContext, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { nseControlHooks, Badge, LoadingSpinner } from "../NSE/NSE";
import { useNSEThemeInteraction } from "../NSE/hostComposition";
import { LayoutView, useNSEAnimationEnvironment, useNSEPresentation, type LayoutTransitionTiming } from "../NSE/Animation";
import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { getKeyboardReorderIndex } from "../SynCloudOS/SynCloudOS";
import { WSFolderTileView } from "./WSFolderTileView";
import { useWSLauncher, WSLauncherPlumbingContext, type WSLauncherPlumbing, type WSLauncherViewController } from "./WSLauncherViewController";
import { resolveWebspringIconPresentation, webspringIconExitDuration, webspringIconSprings, type WebspringIconState, type WSRadialExit } from "./Webspring.transitions";
import type { WSApp, WSFolderItem, WSItem } from "./webspringTypes";

const REORDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

export interface WSIconViewProps {
  readonly item?: WSItem;
  readonly app?: WSApp;
  readonly folder?: WSFolderItem;
  /** Index in its container, for drag and keyboard order. */
  readonly index: number;
  /** Columns for ArrowUp and ArrowDown. Defaults to 4. */
  readonly columns?: number;
  /** Where the icon flies as an app opens; icons without one stay put. */
  readonly radialExit?: WSRadialExit;
  /** How the icon moves to a new slot; `null` moves it at once. Defaults to the reorder spring. */
  readonly layoutTransition?: LayoutTransitionTiming | null;
  readonly showLabel?: boolean;
  /** Replaces the icon's `webspring-board-icon` class. */
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Where an icon is in the entrance and launch choreography. Only icons with an exit take part in a launch. */
function iconState(launcher: WSLauncherViewController, exit: WSRadialExit | undefined): WebspringIconState {
  if (exit) {
    if (launcher.launchPhase === "launching" || launcher.launchPhase === "staging") return "launching";
    if (launcher.launchPhase === "covered") return "covered";
    if (launcher.launchPhase === "returning") return "returning";
  }
  return launcher.entrancePhase ?? "ready";
}

/** An icon's artwork, carried through the entrance and the launch: out past the viewer as an app opens, and back on return. */
function IconArtwork({ index, total, state, exit, children }: {
  readonly index: number;
  readonly total: number;
  readonly state: WebspringIconState;
  readonly exit: WSRadialExit | undefined;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const presentation = resolveWebspringIconPresentation({
    reducedMotion, state, index, total, radialExit: exit,
    exitDuration: webspringIconExitDuration, exitStagger: 0,
  });
  useNSEPresentation(ref, presentation);
  return <span ref={ref} data-nse-part="image" className="webspring-board-icon-artwork" style={presentation.style}>{children}</span>;
}

/** Press, long-press and keyboard handling shared by app and folder icons. */
function useIconInteraction(
  launcher: WSLauncherViewController,
  plumbing: WSLauncherPlumbing,
  itemId: string,
  title: string,
  disabled: boolean,
  index: number,
  containerIds: readonly string[],
  columns: number,
) {
  const cancelLongPress = useRef<(() => void) | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const clearTimer = useCallback(() => {
    cancelLongPress.current?.();
    cancelLongPress.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);
  const editing = launcher.isEditing;

  return {
    editing,
    dragging: launcher.draggingItemId === itemId,
    dataProps: { "data-webspring-item-id": itemId, "data-order-index": index },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === "Escape" && editing) {
        event.preventDefault();
        launcher.finishEditing(true);
        return;
      }
      if (!editing || !REORDER_KEYS.includes(event.key)) return;
      event.preventDefault();
      const targetIndex = getKeyboardReorderIndex(containerIds, itemId, event.key, columns);
      if (launcher.moveItemByKeyboard(itemId, event.key, columns)) plumbing.announceMove(title, targetIndex);
    },
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button > 0 || event.isPrimary === false || disabled) return;
      pressStart.current = { x: event.clientX, y: event.clientY };
      if (editing) {
        plumbing.beginDrag(itemId);
        plumbing.beginPointerDrag(itemId, event.pointerId);
        return;
      }
      cancelLongPress.current = plumbing.scheduleLongPress(itemId, () => {
        plumbing.beginPointerDrag(itemId, event.pointerId);
      });
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = pressStart.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clearTimer();
    },
    onPointerEnd() { pressStart.current = null; clearTimer(); },
  };
}

/**
 * The Webspring icon view, after SpringBoard's: an app or a folder on a launcher. It launches,
 * opens folders, enters edit mode on a long press, and drags and reorders.
 */
export function WSIconView(props: WSIconViewProps) {
  const launcher = useWSLauncher();
  const plumbing = useContext(WSLauncherPlumbingContext);
  if (!plumbing) throw new TypeError("WSIconView must be used inside a WSLauncherRootView.");
  const given = [props.item, props.app, props.folder].filter((value) => value !== undefined).length;
  if (given !== 1) throw new TypeError("WSIconView takes exactly one of item, app or folder.");
  const folder = props.folder ?? (props.item?.kind === "folder" ? props.item : undefined);
  const app = props.app ?? (props.item?.kind === "app" ? props.item.app : undefined);
  return folder
    ? <FolderIcon {...props} launcher={launcher} plumbing={plumbing} folder={folder} />
    : <AppIcon {...props} launcher={launcher} plumbing={plumbing} app={app!} />;
}

interface IconProps extends WSIconViewProps {
  readonly launcher: WSLauncherViewController;
  readonly plumbing: WSLauncherPlumbing;
}

function useReorderMotion(layoutTransition: LayoutTransitionTiming | null | undefined) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  if (layoutTransition !== undefined) return layoutTransition;
  return reducedMotion ? null : webspringIconSprings.reorder;
}

function AppIcon({ launcher, plumbing, app, index, columns = 4, radialExit, layoutTransition, showLabel = true, className, style }: IconProps & { readonly app: WSApp }) {
  const appId = normalizeBundleIdentifier(app.bundleIdentifier);
  const folderMembers = launcher.folders.openFolder?.apps;
  const inOpenFolder = folderMembers?.some((member) => normalizeBundleIdentifier(member.bundleIdentifier) === appId) ?? false;
  const containerIds = inOpenFolder ? folderMembers!.map((member) => normalizeBundleIdentifier(member.bundleIdentifier)) : launcher.items.map((item) => item.id);
  const disabled = app.state === "disabled";
  const drawing = useNSEThemeInteraction<HTMLButtonElement>(!disabled, true);
  const interaction = useIconInteraction(launcher, plumbing, appId, app.displayName, disabled, index, containerIds, columns);
  const reorderMotion = useReorderMotion(layoutTransition);
  const loading = normalizeBundleIdentifier(launcher.openingAppId) === appId || app.state === "loading" || app.state === "launching" || normalizeBundleIdentifier(launcher.launchingAppId) === appId;
  const { editing, dragging } = interaction;

  // A slot springs to wherever an update lays it out; the dragged icon follows the pointer's proxy, so its slot moves at once.
  return <LayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    {...drawing.events} {...nseControlHooks({ control: "app-icon", enabled: !disabled, highlighted: drawing.highlighted, hovered: drawing.hovered, focused: drawing.focused, selected: editing && dragging, variants: { type: "application" } })} data-nse-part="content"
    className={className ?? "webspring-board-icon"} style={style} data-nse-style={editing ? "editing" : undefined} data-nse-state={dragging ? "dragging" : undefined}
    {...interaction.dataProps}
    aria-label={editing ? `Move ${app.displayName}` : `Open ${app.displayName}`}
    aria-pressed={editing ? dragging : undefined}
    disabled={disabled}
    aria-description={disabled ? app.disabledReason : undefined}
    title={disabled ? app.disabledReason : undefined}
    onFocus={() => launcher.prefetchApp(app.bundleIdentifier, true)}
    onBlur={() => launcher.prefetchApp(app.bundleIdentifier, false)}
    onPointerDown={interaction.onPointerDown}
    onPointerMove={interaction.onPointerMove}
    onPointerUp={interaction.onPointerEnd}
    onPointerCancel={interaction.onPointerEnd}
    onLostPointerCapture={interaction.onPointerEnd}
    onKeyDown={interaction.onKeyDown}
    onClick={() => { if (!disabled && !editing) plumbing.openApp(app); }}
  >
    <IconArtwork index={index} total={launcher.items.length} state={iconState(launcher, radialExit)} exit={radialExit}>
      <span data-nse-part="bezel" className="webspring-board-icon-well" data-nse-state={loading ? "loading" : undefined} data-nse-highlighted={normalizeBundleIdentifier(launcher.folders.dropTargetId) === appId ? "" : undefined}>
        {app.iconUrl ? <img data-nse-part="image" src={app.iconUrl} alt="" aria-hidden="true" draggable={false} /> : <span aria-hidden="true">{app.displayName.slice(0, 1)}</span>}
        {loading ? <LoadingSpinner label={`Loading ${app.displayName}`} variant="dark" /> : null}
        <Badge count={app.badgeCount} label={app.badgeLabel} />
      </span>
      {showLabel ? <span data-nse-part="title" className="webspring-board-icon-label">{app.displayName}</span> : null}
    </IconArtwork>
  </button></LayoutView>;
}

function FolderIcon({ launcher, plumbing, folder, index, columns = 4, radialExit, layoutTransition, showLabel = true, className, style }: IconProps & { readonly folder: WSFolderItem }) {
  const interaction = useIconInteraction(launcher, plumbing, folder.id, folder.title, false, index, launcher.items.map((item) => item.id), columns);
  const reorderMotion = useReorderMotion(layoutTransition);
  const { editing, dragging } = interaction;
  const open = launcher.folders.openFolder?.id === folder.id;
  const drawing = useNSEThemeInteraction<HTMLButtonElement>(true, true);

  return <LayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    {...drawing.events} {...nseControlHooks({ control: "app-icon", highlighted: drawing.highlighted, hovered: drawing.hovered, focused: drawing.focused, selected: open || dragging, variants: { type: "folder" } })} data-nse-part="content"
    className={`${className ?? "webspring-board-icon"} is-folder`} style={style} data-nse-style={editing ? "editing" : undefined} data-nse-state={dragging ? "dragging" : undefined}
    {...interaction.dataProps}
    aria-label={editing ? `Move folder ${folder.title}` : `Open folder ${folder.title}`}
    aria-pressed={editing ? dragging : undefined}
    aria-haspopup="dialog"
    aria-expanded={open}
    onPointerDown={interaction.onPointerDown}
    onPointerMove={interaction.onPointerMove}
    onPointerUp={interaction.onPointerEnd}
    onPointerCancel={interaction.onPointerEnd}
    onLostPointerCapture={interaction.onPointerEnd}
    onKeyDown={interaction.onKeyDown}
    onClick={(event) => plumbing.openFolder(folder, event.currentTarget)}
  >
    <IconArtwork index={index} total={launcher.items.length} state={iconState(launcher, radialExit)} exit={radialExit}>
      <span data-nse-part="bezel" className="webspring-board-icon-well">
        <WSFolderTileView folder={folder} dropTarget={launcher.folders.dropTargetId === folder.id} />
        <Badge count={folder.badgeCount} />
      </span>
      {showLabel ? <span data-nse-part="title" className="webspring-board-icon-label">{folder.title}</span> : null}
    </IconArtwork>
  </button></LayoutView>;
}
