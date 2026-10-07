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

import type{NSEScrollerPolicy}from"./scrollTypes";export interface NSEScrollerProps{readonly orientation:"horizontal"|"vertical";readonly policy?:NSEScrollerPolicy;readonly value:number;readonly maximum:number;readonly disabled?:boolean;onValueChange(value:number):void}export function NSEScroller({orientation,policy="automatic",value,maximum,disabled,onValueChange}:NSEScrollerProps){if(policy==="hidden")return null;return <input type="range" aria-label={`${orientation} scroller`} min={0} max={Math.max(0,maximum)} value={Math.min(value,maximum)} disabled={disabled||maximum<=0} data-nse-control="scroller" data-orientation={orientation} data-policy={policy} onChange={event=>onValueChange(Number(event.currentTarget.value))}/>}
