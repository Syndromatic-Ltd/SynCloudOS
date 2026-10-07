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

import webspringReturn from "./Resources/AtmoTopBar/webspring-return.svg?url&no-inline";
import webspringReturnSelected from "./Resources/AtmoTopBar/webspring-return-selected.svg?url&no-inline";
import userInfo from "./Resources/AtmoTopBar/user-info.svg?url&no-inline";
import userInfoSelected from "./Resources/AtmoTopBar/user-info-selected.svg?url&no-inline";

/**
 * The Cumulus bar and its inset controls are painted in CSS (nse-chrome.css);
 * only the two item glyphs are assets, each a vector with a resting (engraved
 * metal) and a selected (lit) rendering.
 */
export const atmoCumulusGlyphs = Object.freeze({
  webspring: Object.freeze({ normal: webspringReturn, selected: webspringReturnSelected }),
  userInfo: Object.freeze({ normal: userInfo, selected: userInfoSelected }),
});
