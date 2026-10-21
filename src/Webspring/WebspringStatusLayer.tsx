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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { NSEPresence } from "../NSE/Animation";
import { NSEAlertBackdrop } from "../NSE/NSE";
import { SystemAlert, SystemAlertAssetCache, useResolvedAppearance } from "../SynCloudOSReact";
import { FocusScope, useKernelSynCloudOS, useRuntimeSelector } from "../SynCloudOSReact";
import type { CapturedSynCloudOSError } from "../SynCloudOS/SynCloudOS";

export function WebspringStatusLayer({ errors }: { errors: CapturedSynCloudOSError[] }) {
  const runtime = useKernelSynCloudOS();
  const appearance = useResolvedAppearance();
  const latest = errors[errors.length - 1] ?? null;
  const appId = latest?.appId ?? latest?.context?.appId;
  const applicationIcon = useRuntimeSelector((snapshot) => typeof appId === "string"
    ? snapshot.appInfo[normalizeBundleIdentifier(appId)]?.icon.src ?? null
    : null);

  function dismissLatest() {
    if (!latest) return;
    runtime.errors.dismiss(latest.id);
  }

  async function returnLatestToWebspring() {
    if (!latest) return;
    const result = await runtime.commands.dispatch(
      "workspace.returnToWebspring",
      undefined,
      { source: "system", responderId: "workspace" },
    );
    if (
      result.status === "executed" ||
      (result.status === "cancelled" && result.reason === "return-decision-pending")
    ) {
      runtime.errors.dismiss(latest.id);
    }
  }

  return (
    <>
      <SystemAlertAssetCache />
      {/* The backdrop and alert play their AnimationFX exits before removal. */}
      <NSEPresence>
        {latest ? (
          <FocusScope asChild key={latest.id} scopeId={`system-alert:${latest.id}`} kind="modal" parentResponderId="workspace" trapFocus>
            <NSEAlertBackdrop
              onSafeDismiss={latest.recoverable === false ? undefined : () => runtime.errors.dismiss(latest.id)}
            >
              <SystemAlert
                error={latest}
                appearance={appearance}
                applicationIcon={applicationIcon}
                onDismiss={dismissLatest}
                onReload={() => runtime.environment.browser.getWindow()?.location.reload()}
                onReturn={() => { void returnLatestToWebspring(); }}
                onOpenMailClient={(destination) => runtime.environment.browser.getWindow()?.location.assign(destination)}
              />
            </NSEAlertBackdrop>
          </FocusScope>
        ) : null}
      </NSEPresence>
    </>
  );
}
