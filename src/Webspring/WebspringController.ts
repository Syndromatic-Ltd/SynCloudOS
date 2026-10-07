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
  resolveSiteBranding,
  type RuntimeSnapshot,
  type SynCloudOSHorizontalSizeClass,
  type SynCloudOSLocaleBundleResourceInput,
  type SynCloudOSRouteResolution,
  type SynCloudOSRuntime,
} from "../SynCloudOS/SynCloudOS";
import { AppInfo } from "../SynCloudOS/SynCloudOS";
import { createWebspringLayout, getOrderedVisibleWebspringApps } from "./webspringLayout";
import { cancelWebspringAppPrefetch, scheduleWebspringAppPrefetch } from "./webspringPrefetch";
import type { NSEFontFamily } from "../NSE/NSE";
import type { WebspringContentController, WebspringContentSectionSnapshot } from "./webspringContent";
import type {
  ActionResult,
  AuthenticationInput,
  Presentation,
  WebspringActions,
  WebspringDefinition,
  WebspringViewModel,
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
    private readonly contentController?: Pick<WebspringContentController, "refresh">,
  ) {
    this.assertHomeConfiguration();
    const actions: WebspringActions = {
      openApp: this.openApp.bind(this),
      returnHome: this.returnHome.bind(this),
      reorder: this.reorder.bind(this),
      previewApp: (appId) => this.runtime.webspring.hoverApp(appId),
      prefetchApp: (appId, active) => active ? scheduleWebspringAppPrefetch(this.runtime, appId) : cancelWebspringAppPrefetch(this.runtime, appId),
      beginEditing: (appId) => this.runtime.webspring.enterEditMode(appId),
      scheduleLongPress: (appId, onRecognised) => {
        let active = true;
        const handle = this.runtime.environment.setTimeout(() => {
          if (!active) return;
          active = false;
          this.runtime.webspring.enterEditMode(appId);
          this.runtime.webspring.beginDrag(appId);
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
      moveApp: (appId, targetIndex, commit = false) => this.runtime.webspring.reorderApp(appId, targetIndex, commit),
      moveAppByKeyboard: (appId, key, columns = 1) => this.runtime.webspring.moveEditingAppByKeyboard(appId, key, columns),
      beginDrag: (appId) => this.runtime.webspring.beginDrag(appId),
      finishDrag: (commit = true) => this.runtime.webspring.endDrag(commit),
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
      refreshContent: async () => { await this.contentController?.refresh(); },
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

  model(snapshot: RuntimeSnapshot, presentation: Presentation, contentSections: readonly WebspringContentSectionSnapshot[] = [], entrancePhase: WebspringViewModel["entrancePhase"] = "ready"): WebspringViewModel {
    const declaration = this.shell.manifest.webspringShell;
    const resourceUrls = this.resources?.resourceUrls ?? {};
    const branding = resolveSiteBranding(declaration.branding, resourceUrls, this.runtime.locale, this.shell.manifest.id);
    const traits = this.runtime.presentationTraits.getSnapshot();
    const orderedApps = getOrderedVisibleWebspringApps(Object.values(snapshot.appInfo), snapshot.webspring.layout.preference.order);
    const layout = createWebspringLayout(orderedApps, snapshot.webspring.layout.preference.order);
    const apps = orderedApps
      .map((app) => Object.freeze({
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
        dialPlacement: Object.freeze({ ...layout.placements[app.id]!, iconPosition: Object.freeze({ ...layout.placements[app.id]!.iconPosition }), indicatorPosition: layout.placements[app.id]!.indicatorPosition ? Object.freeze({ ...layout.placements[app.id]!.indicatorPosition! }) : null, labelPosition: Object.freeze({ ...layout.placements[app.id]!.labelPosition }) }),
      }));
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
        draggingAppId: snapshot.webspring.layout.draggingAppId,
        board: Object.freeze({ ...snapshot.webspring.layout.preference.board }),
      }),
      presentationTraits: Object.freeze({
        width: traits.hostViewportBounds.width,
        height: traits.hostViewportBounds.height,
        reducedMotion: traits.reducedMotion,
        safeAreaInsets: Object.freeze({ ...traits.safeAreaInsets }),
      }),
      apps: Object.freeze(apps),
      sections: Object.freeze(contentSections.map((section) => Object.freeze({
        id: section.id,
        title: resolveSiteBranding({ name: section.title }, {}, this.runtime.locale, this.shell.manifest.id).name,
        empty: section.empty,
        state: section.state,
      }))),
      branding,
      account: Object.freeze(this.accountAction()),
    });
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

  private async reorder(appIds: readonly string[]): Promise<ActionResult> {
    const currentIds = this.model(this.runtime.store.getSnapshot(), "desktop").apps.map((app) => app.id);
    if (appIds.length !== currentIds.length || new Set(appIds).size !== appIds.length || appIds.some((id) => !currentIds.includes(id))) {
      return { status: "failed", message: "Application order must contain every visible app exactly once." };
    }
    appIds.forEach((id, index) => this.runtime.webspring.reorderApp(id, index, index === appIds.length - 1));
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
