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

import { NSEGroupBox, NSEListItem, NSEPushButton } from "../../../NSE/public/controls";
import { definePreferencePane } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { useSystemUIAccount } from "../systemAccount";
import { useSystemText } from "../useSystemText";

function useAccountLabel() {
  const account = useSystemUIAccount();
  const t = useSystemText();
  return account.signedIn ? account.name ?? t("preferences.signedIn", "Signed In") : t("preferences.notSignedIn", "Not Signed In");
}

function AccountSummary() {
  return <>{useAccountLabel()}</>;
}

function AccountPane() {
  const runtime = useKernelSynCloudOS();
  const account = useSystemUIAccount();
  const t = useSystemText();
  const label = useAccountLabel();
  return (
    <div className="nse-prefs-section">
      <NSEGroupBox>
        <NSEListItem
          tapHighlight={false}
          trailing={account.signedIn ? (
            <NSEPushButton onClick={() => {
              runtime.systemUI.preferences.close();
              runtime.systemUI.session.requestLogOut();
            }}>{t("session.logOut", "Log Out")}</NSEPushButton>
          ) : (
            <NSEPushButton onClick={() => {
              runtime.systemUI.preferences.close();
              account.onSignIn();
            }}>{t("session.signIn", "Sign In")}</NSEPushButton>
          )}
        >
          {label}
        </NSEListItem>
      </NSEGroupBox>
    </div>
  );
}

/** Listed only where the host offers sign-in. */
export default definePreferencePane({
  id: "account",
  title: { key: "preferences.account", fallback: "Account" },
  order: 50,
  summary: AccountSummary,
  view: AccountPane,
});
