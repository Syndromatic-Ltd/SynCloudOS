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

import { useMemo } from "react";
import { NSEGroupBox, NSEListItem } from "../../../NSE/public/controls";
import { definePreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { useSystemText } from "../useSystemText";

function useAppearanceChoices() {
  const t = useSystemText();
  return useMemo(() => ([
    { value: "light" as const, label: t("preferences.light", "Light") },
    { value: "dark" as const, label: t("preferences.dark", "Dark") },
    { value: "auto" as const, label: t("preferences.auto", "Auto") },
  ]), [t]);
}

function AppearanceSummary({ appearance }: PreferencePaneViewProps) {
  const choices = useAppearanceChoices();
  return <>{choices.find((choice) => choice.value === appearance)?.label ?? appearance}</>;
}

function AppearancePane({ appearance }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const choices = useAppearanceChoices();
  return (
    <div className="nse-prefs-section">
      <NSEGroupBox>
        {choices.map((choice) => (
          <NSEListItem
            key={choice.value}
            selected={appearance === choice.value}
            onClick={() => runtime.appearance.set(choice.value)}
          >
            {choice.label}
          </NSEListItem>
        ))}
      </NSEGroupBox>
      <p className="nse-prefs-note">
        {t("preferences.autoNote", "Auto follows the system setting on this device.")}
      </p>
    </div>
  );
}

export default definePreferencePane({
  id: "appearance",
  title: { key: "preferences.appearance", fallback: "Appearance" },
  order: 100,
  summary: AppearanceSummary,
  view: AppearancePane,
});
