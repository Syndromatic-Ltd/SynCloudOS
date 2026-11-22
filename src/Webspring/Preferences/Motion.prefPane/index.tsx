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

import { NSEBox } from "../../../NSE/public/controls";
import { GroupedRow } from "../../../NSE/Controls/Selection/GroupedRow";
import { NSEPreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
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
      <NSEBox>
        {([
          { value: "standard" as const, label: t("preferences.standard", "Standard") },
          { value: "reduced" as const, label: t("preferences.reduced", "Reduced") },
        ]).map((choice) => (
          <GroupedRow
            key={choice.value}
            selected={motion === choice.value}
            onClick={() => runtime.settings.set("motion", choice.value)}
          >
            {choice.label}
          </GroupedRow>
        ))}
      </NSEBox>
      <p data-nse-part="label" data-nse-role="note" className="nse-prefs-note">
        {t("preferences.motionNote", "Reduced motion replaces slides and zooms with a simple fade.")}
      </p>
    </div>
  );
}

export default class MotionPreferencePane extends NSEPreferencePane {
  static id = "motion";
  static title = { key: "preferences.motion", fallback: "Motion" };
  static order = 300;

  override renderSummary() {
    return <MotionSummary settings={this.settings} appearance={this.appearance} locale={this.locale} />;
  }

  override renderView() {
    return <MotionPane settings={this.settings} appearance={this.appearance} locale={this.locale} />;
  }
}
