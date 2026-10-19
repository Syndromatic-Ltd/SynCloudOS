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
  WEBSPRING_PRESENTATION_ROLES,
  getDesktopWebspringSlots,
  reconcileWebspringLayout,
  resolveSiteBranding,
  type RuntimeSnapshot,
  type SynCloudOSHorizontalSizeClass,
  type SynCloudOSLocaleBundleResourceInput,
  type SynCloudOSRouteResolution,
  type SynCloudOSRuntime,
  type WebspringDesktopSlot,
} from "../SynCloudOS/SynCloudOS";
import { AppInfo } from "../SynCloudOS/SynCloudOS";
import { cancelWebspringAppPrefetch, scheduleWebspringAppPrefetch } from "./webspringPrefetch";
import type { NSEFontFamily } from "../NSE/NSE";
import type {
  ActionResult,
  AuthenticationInput,
  LocalisedText,
  Presentation,
  WebspringActions,
  WebspringApp,
  WebspringDefinition,
  WebspringDialPlacement,
  WebspringItem,
  WebspringViewModel,
  WebspringWidgetEntry,
} from "./webspringTypes";

export interface SynCloudOSShellResources {
  readonly resourceUrls?: Readonly<Record<string, string>>;
  readonly localeResources?: SynCloudOSLocaleBundleResourceInput;
  readonly fontResourceUrls?: Readonly<Record<string, string>>;
  /** Site-supplied faces offered by the shared Fonts panel. The host loads
   * their CSS/font resources; supplying metadata does not load font files. */
  readonly fontFamilies?: readonly NSEFontFamily[];
}

function operationResult(result: { readonly status: string; readonly error?: unknown }): ActionResult {
  if (result.status === "completed" || result.status === "executed") return { status: "completed" };
  if (result.status === "cancelled") return { status: "cancelled" };
  return { status: "failed", message: result.error instanceof Error ? result.error.message : "The operation could not be completed." };
}

function dialPlacement(slot: WebspringDesktopSlot): WebspringDialPlacement {
  return Object.freeze({
    angle: slot.angle,
    iconPosition: Object.freeze({ ...slot.iconPosition }),
    indicatorPosition: slot.indicatorPosition ? Object.freeze({ ...slot.indicatorPosition }) : null,
    labelPosition: Object.freeze({ ...slot.labelPosition }),
  });
}

export function presentationForSizeClass(sizeClass: SynCloudOSHorizontalSizeClass): Presentation {
  if (sizeClass === "compact") return "mobile";
  if (sizeClass === "regular") return "tablet";
  return "desktop";
}

export class WebspringController {
  private completedLaunchTransitionId: string | null = null;
  readonly actions: WebspringActions;

  constructor(
    private readonly runtime: SynCloudOSRuntime,
    readonly shell: WebspringDefinition,
    private readonly resources: SynCloudOSShellResources | undefined,
    readonly authentication: AuthenticationInput = "disabled",
  ) {
    this.assertHomeConfiguration();
    const actions: WebspringActions = {
      openApp: this.openApp.bind(this),
      returnHome: this.returnHome.bind(this),
      reorder: this.reorder.bind(this),
      previewApp: (appId) => this.runtime.webspring.hoverApp(appId),
      prefetchApp: (appId, active) => active ? scheduleWebspringAppPrefetch(this.runtime, appId) : cancelWebspringAppPrefetch(this.runtime, appId),
      beginEditing: (appId) => this.runtime.webspring.enterEditMode(appId),
      scheduleLongPress: (itemId, onRecognised) => {
        let active = true;
        const handle = this.runtime.environment.setTimeout(() => {
          if (!active) return;
          active = false;
          this.runtime.webspring.enterEditMode(itemId);
          this.runtime.webspring.beginDrag(itemId);
          onRecognised();
        }, 520);
        return () => {
          if (!active) return;
          active = false;
          this.runtime.environment.clearTimeout(handle);
        };
      },
      finishEditing: (commit = true) => this.runtime.webspring.exitEditMode(commit),
      resetOrder: () => this.runtime.webspring.resetLayoutOrder(),
      moveItem: (itemId, targetIndex, commit = false) => this.runtime.webspring.moveItem(itemId, targetIndex, commit),
      moveItemByKeyboard: (itemId, key, columns = 1) => this.runtime.webspring.moveItemByKeyboard(itemId, key, columns),
      setDropTarget: (itemId) => this.runtime.webspring.setDropTarget(itemId),
      dropOnItem: (appId, targetItemId) => this.runtime.webspring.dropOnItem(appId, targetItemId),
      moveAppOutOfFolder: (appId, targetIndex) => this.runtime.webspring.moveAppOutOfFolder(appId, targetIndex),
      openFolder: (folderId) => this.runtime.webspring.openFolder(folderId),
      closeFolder: () => this.runtime.webspring.closeFolder(),
      beginDrag: (itemId) => this.runtime.webspring.beginDrag(itemId),
      finishDrag: (commit = true) => this.runtime.webspring.finishDrag(commit),
      completeLaunch: (transitionId, appId) => { this.completeLaunch(transitionId, appId); },
      scheduleLaunchCompletion: (transitionId, appId, delayMs) => {
        let active = true;
        const handle = this.runtime.environment.setTimeout(() => {
          if (!active) return;
          active = false;
          this.completeLaunch(transitionId, appId);
        }, Math.max(0, delayMs));
        return () => {
          if (!active) return;
          active = false;
          this.runtime.environment.clearTimeout(handle);
        };
      },
      completeReturnTrack: () => undefined,
      openNotificationCentre: (notificationId) => { void this.runtime.commands.dispatch("webspring.notificationCentre.open", notificationId ? { notificationId } : undefined); },
      requestSignIn: this.requestSignIn.bind(this),
      requestSignOut: this.requestSignOut.bind(this),
    };
    this.actions = Object.freeze(actions);
  }

  private assertHomeConfiguration() {
    const declaration = this.shell.manifest.webspringShell;
    const home = this.runtime.routes.resolveRoute(declaration.homeRoute) as SynCloudOSRouteResolution;
    const defaultModes = (Object.keys(declaration.defaults) as Presentation[]).map((presentation) => {
      const id = declaration.defaults[presentation];
      return declaration.views.find((view) => view.id === id)!.mode;
    });
    if (defaultModes.includes("launcher") && home.kind !== "webspring") {
      throw new TypeError(`Launcher Webspring homeRoute ${declaration.homeRoute} must resolve to the shell.`);
    }
    if (!defaultModes.includes("launcher") && home.kind !== "webspring" && home.kind !== "app") {
      throw new TypeError(`Persistent Webspring homeRoute ${declaration.homeRoute} is not routeable.`);
    }
  }

  viewId(presentation: Presentation): string {
    return this.shell.manifest.webspringShell.defaults[presentation];
  }

  fallbackViewId(presentation: Presentation, failedViewId: string): string | null {
    return this.shell.manifest.webspringShell.views.find((view) => view.id !== failedViewId && view.presentations.includes(presentation))?.id ?? null;
  }

  model(snapshot: RuntimeSnapshot, presentation: Presentation, entrancePhase: WebspringViewModel["entrancePhase"] = "ready"): WebspringViewModel {
    const declaration = this.shell.manifest.webspringShell;
    const resourceUrls = this.resources?.resourceUrls ?? {};
    const branding = resolveSiteBranding(declaration.branding, resourceUrls, this.runtime.locale, this.shell.manifest.id);
    const resolveText = (text: LocalisedText) => resolveSiteBranding({ name: text }, {}, this.runtime.locale, this.shell.manifest.id).name;
    const widgets = Object.freeze(this.shell.widgets.map((widget): WebspringWidgetEntry => Object.freeze({
      widget,
      title: resolveText(widget.title),
      iconUrl: widget.icon ? resourceUrls[widget.icon] ?? null : null,
      emptyMessage: widget.whenEmpty === "hide" ? null : resolveText(widget.whenEmpty.message),
    })));
    const traits = this.runtime.presentationTraits.getSnapshot();
    const projection = reconcileWebspringLayout(
      Object.values(snapshot.appInfo),
      snapshot.webspring.layout.preference,
      snapshot.webspring.layout.folderConfiguration,
    );
    const appsById = new Map(projection.appOrder.map((appId) => {
      const app = snapshot.appInfo[appId]!;
      const viewApp: WebspringApp = Object.freeze({
        id: app.id,
        title: app.displayName,
        iconUrl: app.icon.src || null,
        route: app.route,
        selected: snapshot.application.activeAppId === app.id,
        running: snapshot.application.openAppIds.includes(app.id),
        state: app.isDisabled ? "disabled" as const : snapshot.lifecycle[app.id] ?? "registered",
        disabledReason: app.isDisabled || snapshot.lifecycle[app.id] === "disabled" ? AppInfo.explain(app).reason : undefined,
        badgeCount: app.notifications.badgeCount ?? 0,
        accent: app.webspring.accent ?? "#eaf6ff",
        featured: Boolean(app.webspring.featured),
        selectorAngle: app.webspring.selectorAngle ?? app.webspring.dialPosition ?? 0,
      });
      return [appId, viewApp] as const;
    }));
    const folderTitles = new Map((declaration.folders?.initial ?? []).map((folder) => [folder.id, folder.title]));
    const items = getDesktopWebspringSlots(projection.order).slots.map((slot): WebspringItem => {
      const members = projection.folders[slot.id];
      if (!members) return Object.freeze({ kind: "app", id: slot.id, app: appsById.get(slot.id)!, dialPlacement: dialPlacement(slot) });
      const apps = Object.freeze(members.map((appId) => appsById.get(appId)!));
      return Object.freeze({
        kind: "folder",
        id: slot.id,
        title: this.folderTitle(folderTitles.get(slot.id)),
        apps,
        badgeCount: apps.reduce((total, app) => total + app.badgeCount, 0),
        dialPlacement: dialPlacement(slot),
      });
    });
    return Object.freeze({
      presentation,
      activeAppId: snapshot.application.activeAppId,
      routePath: snapshot.application.routePath,
      sessionState: snapshot.loginServices.isAuthorised ? "authorised" : "locked",
      shellLockState: snapshot.statechart.currentState === "locked.loginWindow" ? "login" : "webspring",
      entrancePhase,
      selectedAppId: snapshot.webspring.selectedAppId,
      hoveredAppId: snapshot.webspring.hoveredAppId,
      activeIndicatorId: snapshot.webspring.activeIndicatorId,
      selectorAngle: snapshot.webspring.selectorAngle,
      previewAppId: snapshot.webspring.previewAppId,
      launchingAppId: snapshot.webspring.launchingAppId,
      launchTransitionId: snapshot.webspring.launchTransitionId,
      returnTransitionId: snapshot.webspring.returnTransitionId,
      launchPhase: snapshot.webspring.launchPhase,
      layout: Object.freeze({
        editing: snapshot.webspring.layout.isEditing,
        draggingItemId: snapshot.webspring.layout.draggingItemId,
        board: Object.freeze({ ...snapshot.webspring.layout.preference.board }),
      }),
      presentationTraits: Object.freeze({
        width: traits.hostViewportBounds.width,
        height: traits.hostViewportBounds.height,
        reducedMotion: traits.reducedMotion,
        safeAreaInsets: Object.freeze({ ...traits.safeAreaInsets }),
      }),
      apps: Object.freeze([...appsById.values()]),
      items: Object.freeze(items),
      folders: Object.freeze({
        editable: snapshot.webspring.layout.folderConfiguration.editable,
        openFolderId: snapshot.webspring.openFolderId,
        dropTargetId: snapshot.webspring.layout.dropTargetId,
      }),
      widgets,
      background: this.shell.background,
      branding,
      account: Object.freeze(this.accountAction()),
    });
  }
  /** A manifest folder's localised title; folders visitors make share one system title. */
  private folderTitle(title: LocalisedText | undefined) {
    const text = title ?? { key: "webspring.folder.untitled", fallback: "Folder" };
    const namespace = title ? this.shell.manifest.id : undefined;
    const translated = this.runtime.locale.t(text.key, undefined, namespace);
    return translated === text.key ? text.fallback ?? text.key : translated;
  }

  private completeLaunch(transitionId: string, appId: string) {
    if (this.completedLaunchTransitionId === transitionId) return;
    if (!this.runtime.webspring.completeLaunchCover(transitionId, appId)) return;
    this.completedLaunchTransitionId = transitionId;
    const presentationSettlementId = this.runtime.store.getSnapshot().webspring.presentationSettlementId;
    if (!presentationSettlementId) return;
    this.runtime.presentationSettlements
      .get(presentationSettlementId)
      ?.completeRole(WEBSPRING_PRESENTATION_ROLES.shellReturn);
  }

  private async openApp(appId: string, route?: string): Promise<ActionResult> {
    const app = this.runtime.apps.getApp(appId);
    if (!app) return { status: "failed", message: `Unknown application ${appId}.` };
    // A launch from inside a folder closes the folder first.
    this.runtime.webspring.closeFolder();
    const context = {
      launcher: "WebspringHost",
      siteName: this.model(this.runtime.store.getSnapshot(), "desktop").branding.name,
    };
    if (route !== undefined) {
      const resolution = this.runtime.routes.resolveRoute(route) as SynCloudOSRouteResolution;
      if (resolution.kind !== "app" || resolution.app.id !== appId) {
        return { status: "failed", message: `Route ${route} is outside ${appId}'s declared authority.` };
      }
      const result = await this.runtime.routes.openRoute(route, { source: "webspring-controller", context }).result;
      if (result.status === "completed" && result.value.presentationSettlementId) {
        await this.runtime.presentationSettlements.get(result.value.presentationSettlementId)?.result;
      }
      return operationResult(result);
    }
    const result = await this.runtime.routes.openRoute(app.route, { source: "webspring-controller", context }).result;
    if (result.status === "completed" && result.value.presentationSettlementId) {
      await this.runtime.presentationSettlements.get(result.value.presentationSettlementId)?.result;
    }
    return operationResult(result);
  }

  private async returnHome(): Promise<ActionResult> {
    const homeRoute = this.shell.manifest.webspringShell.homeRoute;
    if (homeRoute === "/") return operationResult(await this.runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "system" }));
    return operationResult(await this.runtime.routes.openRoute(homeRoute, { source: "webspring-controller" }).result);
  }

  private async reorder(itemIds: readonly string[]): Promise<ActionResult> {
    if (!this.runtime.webspring.reorder(itemIds)) {
      return { status: "failed", message: "The top-level order must contain every Webspring entry exactly once." };
    }
    return { status: "completed" };
  }

  private async requestSignIn(): Promise<ActionResult> {
    const policy = typeof this.authentication === "string" ? this.authentication : this.authentication.policy;
    if (policy === "disabled") return { status: "failed", message: "Authentication is disabled." };
    if (typeof this.authentication === "string") return { status: "failed", message: "Authentication is not configured." };
    this.runtime.statechart.gotoState("locked.loginWindow", { source: "webspring-account", closeWindows: false, syncRoute: false });
    return { status: "completed" };
  }

  private async requestSignOut(): Promise<ActionResult> {
    if (typeof this.authentication !== "object" || this.authentication.service.getSnapshot().status !== "authenticated") return { status: "completed" };
    return operationResult(await this.runtime.commands.dispatch("session.logOut", undefined, { source: "system" }));
  }

  private accountAction() {
    if (typeof this.authentication === "string") return this.authentication === "disabled" ? { kind: "none" as const } : { kind: "pending" as const };
    const state = this.authentication.service.getSnapshot();
    if (state.status === "checking" || state.status === "authenticating") return { kind: "pending" as const };
    if (state.status === "authenticated" && state.profile) return { kind: "account" as const, label: state.profile.name ?? state.profile.email ?? "Account", signOutLabel: "Log Out" };
    return { kind: "signIn" as const, label: "Sign In" };
  }
}
