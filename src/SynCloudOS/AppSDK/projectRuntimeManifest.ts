/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { synCloudOSLogoUrl } from "../Resources/frameworkAssets";
import type {
  SynCloudOSAppAboutManifest,
  SynCloudOSAppFrameManifest,
  SynCloudOSAppManifest,
  SynCloudOSAppAccessPolicy,
} from "../SynCloudOS";
// The window-surface defaults come from their leaf module: a value import of
// the SynCloudOS facade would make app definition depend on runtime construction.
import { defaultWindowSmoothSurface, normaliseWindowSmoothSurface } from "../Windows/windowTypes";
import type { SynWareFrameManifest, SynWareManifestV1, SynWareRuntimeManifestContext } from "./manifest/manifestTypes";

const DEFAULT_WEBSPRING_ORDER = 1000;
const DEFAULT_ICON_SRC = synCloudOSLogoUrl;

const standardV1Frame: SynCloudOSAppFrameManifest = {
  material: "standard",
  topBar: "standard",
  presentationMotion: "host",
  rightSlot: "auto",
  background: "system",
  smoothSurface: { radius: 31 },
};

function cleanString(value: string): string {
  return value.trim();
}


function projectPolicy(manifest: Readonly<SynWareManifestV1>): SynCloudOSAppAccessPolicy | undefined {
  const declaredPolicy = manifest.runtime?.policy;
  if (declaredPolicy) {
    return {
      public: declaredPolicy.public,
      requiresLogin: declaredPolicy.requiresLogin,
      requiredCapabilities: declaredPolicy.requiredCapabilities ? [...declaredPolicy.requiredCapabilities] : undefined,
      requiredAccessClasses: declaredPolicy.requiredAccessClasses ? [...declaredPolicy.requiredAccessClasses] : undefined,
    };
  }
  return manifest.permissions?.includes("app.open.public") ? { public: true } : undefined;
}

/** The authoring frame with its right-slot icon resolved to the URL the host registered for it. Without a
 *  resource map (a host that bundles no resources) the declared resource path stands in as the URL. */
function projectFrame(
  frame: SynWareFrameManifest | undefined,
  resourceUrls: SynWareRuntimeManifestContext["resourceUrls"],
): Partial<SynCloudOSAppFrameManifest> {
  if (!frame) return standardV1Frame;
  const { rightSlot, ...rest } = frame;
  if (typeof rightSlot !== "object") return frame as Partial<SynCloudOSAppFrameManifest>;
  const resource = rightSlot.icon.resource;
  const icon = resourceUrls ? resourceUrls[resource] : resource;
  if (icon === undefined) throw new TypeError(`SynWare right-slot icon resource ${resource} is not registered.`);
  return { ...rest, rightSlot: { icon, label: rightSlot.label } };
}

function projectAbout(version: string, about: SynWareRuntimeManifestContext["about"]): SynCloudOSAppAboutManifest {
  return {
    version,
    copyright: about?.copyright ?? "",
    trademark: about?.trademark ?? "",
    ...(about?.tagline ? { tagline: about.tagline } : {}),
  };
}

/** Projects the closed V1 SynWare declaration into the runtime registry
 * manifest. All runtime defaults live here; bundle loading and resource URL
 * resolution remain host responsibilities. */
export function projectRuntimeManifest(
  manifest: Readonly<SynWareManifestV1>,
  context: SynWareRuntimeManifestContext,
): Readonly<SynCloudOSAppManifest> {
  const id = cleanString(manifest.id);
  const displayName = cleanString(manifest.title);
  const defaults = manifest.windowDefaults ?? {};
  const presentation = manifest.runtime?.presentation
    ?? (defaults.role === "modal" || defaults.role === "sheet" ? "systemSheet" : "appView");
  const requiredServices = manifest.services?.filter((service) => service.required !== false).map((service) => service.id) ?? [];
  const optionalServices = manifest.services?.filter((service) => service.required === false).map((service) => service.id) ?? [];
  const serviceIds = new Set(requiredServices);
  const primaryRoute = manifest.routes?.find((route) => route.primary) ?? manifest.routes?.[0];
  const routeClaims = manifest.routes?.map((route) => Object.freeze({
    path: cleanString(route.path),
    match: route.match ?? "exact" as const,
  }));
  const width = defaults.width ?? 820;
  const height = defaults.height ?? 580;
  const minimumWidth = defaults.minimumWidth ?? 340;
  const minimumHeight = defaults.minimumHeight ?? 420;
  const type = manifest.runtime?.type
    ?? (manifest.permissions?.includes("diagnostics.view") ? "system" : "internal");
  const iconSource = manifest.webspring?.icon ?? DEFAULT_ICON_SRC;
  const policy = projectPolicy(manifest);
  const showsNotifications = serviceIds.has("notifications");
  const smoothSurface = defaults.smoothSurface === undefined
    ? defaultWindowSmoothSurface
    : normaliseWindowSmoothSurface(defaults.smoothSurface === false ? "off" : defaults.smoothSurface) ?? "off";

  return Object.freeze<SynCloudOSAppManifest>({
    id,
    name: id,
    packageName: context.packageName,
    bundleId: manifest.runtime?.bundleId ?? `com.syndromatic.syncloudos.${context.componentKey}`,
    displayName,
    shortName: displayName,
    description: `${displayName} SynWare.`,
    type,
    disabled: manifest.runtime?.disabled,
    disabledReason: manifest.runtime?.disabledReason,
    route: cleanString(primaryRoute?.path ?? `/${id}`),
    ...(routeClaims?.length ? { routeClaims: Object.freeze(routeClaims) } : {}),
    path: context.path,
    componentKey: context.componentKey,
    presentation,
    requiredServices,
    optionalServices,
    icon: { src: iconSource, alt: `${displayName} icon` },
    webspring: {
      visible: manifest.webspring?.visible ?? true,
      order: manifest.webspring?.order ?? DEFAULT_WEBSPRING_ORDER,
      featured: manifest.webspring?.featured,
      defaultSelected: manifest.webspring?.defaultSelected,
    },
    window: {
      title: defaults.title ?? displayName,
      defaultWidth: width,
      defaultHeight: height,
      minWidth: minimumWidth,
      minHeight: minimumHeight,
      chrome: defaults.chrome ?? "system",
      smoothSurface,
      resizable: defaults.resizable ?? true,
      role: defaults.role === "panel" || defaults.role === "hud" ? defaults.role : "standard",
      defaultBounds: { x: 80, y: 60, width, height },
      minimumSize: { width: minimumWidth, height: minimumHeight },
      style: [
        "titled",
        "closable",
        "minimisable",
        ...(defaults.resizable === false ? [] : ["resizable", "zoomable"]),
      ] as SynCloudOSAppManifest["window"]["style"],
      mobilePolicy: "fullscreen",
      restorationKey: `application.${id}.primary`,
    },
    frame: projectFrame(manifest.frame, context.resourceUrls),
    applicationMenu: manifest.applicationMenu,
    lifecycle: {
      preload: manifest.lifecycle?.preload ?? false,
      loadInBackground: manifest.background?.enabled ?? false,
    },
    notifications: { showsNotifications, badgeCount: manifest.runtime?.notifications?.badgeCount ?? 0 },
    seo: { title: displayName, description: `${displayName} SynWare.` },
    about: projectAbout(manifest.version, context.about),
    ...(policy === undefined ? {} : { policy }),
  });
}
