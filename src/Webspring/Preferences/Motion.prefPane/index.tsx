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

import { NSEGroupBox, NSEListItem } from "../../../NSE/public/controls";
import { definePreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { useSystemText } from "../useSystemText";

function MotionSummary({ settings }: PreferencePaneViewProps) {
  const t = useSystemText();
  return <>{settings.motion === "reduced" ? t("preferences.reduced", "Reduced") : t("preferences.standard", "Standard")}</>;
}

function MotionPane({ settings }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const motion = settings.motion === "reduced" ? "reduced" : "standard";
  return (
    <div className="nse-prefs-section">
      <NSEGroupBox>
        {([
          { value: "standard" as const, label: t("preferences.standard", "Standard") },
          { value: "reduced" as const, label: t("preferences.reduced", "Reduced") },
        ]).map((choice) => (
          <NSEListItem
            key={choice.value}
            selected={motion === choice.value}
            onClick={() => runtime.settings.set("motion", choice.value)}
          >
            {choice.label}
          </NSEListItem>
        ))}
      </NSEGroupBox>
      <p className="nse-prefs-note">
        {t("preferences.motionNote", "Reduced motion replaces slides and zooms with a simple fade.")}
      </p>
    </div>
  );
}

export default definePreferencePane({
  id: "motion",
  title: { key: "preferences.motion", fallback: "Motion" },
  order: 300,
  summary: MotionSummary,
  view: MotionPane,
});
