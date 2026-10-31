/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

/** Native focus may leave a retained action clipped after an adaptive modal
 * resize. Reveal it only in scroll regions inside this scope; never move its
 * parent window or the host document as scrollIntoView() could. */
export function revealKeyboardTarget(root: HTMLElement, target: HTMLElement): void {
  for (let container = target.parentElement; container && root.contains(container); container = container.parentElement) {
    const style = container.ownerDocument.defaultView?.getComputedStyle(container);
    if (!style) continue;
    const bounds = container.getBoundingClientRect();
    const action = target.getBoundingClientRect();
    const scaleY = container.offsetHeight > 0 ? bounds.height / container.offsetHeight : 1;
    const scaleX = container.offsetWidth > 0 ? bounds.width / container.offsetWidth : 1;
    if (/^(auto|scroll)$/.test(style.overflowY || style.overflow) && container.clientHeight > 0 && container.scrollHeight > container.clientHeight && scaleY > 0) {
      const top = bounds.top + container.clientTop * scaleY;
      const bottom = top + container.clientHeight * scaleY;
      container.scrollTop += (action.top < top ? action.top - top : Math.max(0, action.bottom - bottom)) / scaleY;
    }
    if (/^(auto|scroll)$/.test(style.overflowX || style.overflow) && container.clientWidth > 0 && container.scrollWidth > container.clientWidth && scaleX > 0) {
      const left = bounds.left + container.clientLeft * scaleX;
      const right = left + container.clientWidth * scaleX;
      container.scrollLeft += (action.left < left ? action.left - left : Math.max(0, action.right - right)) / scaleX;
    }
    if (container === root) break;
  }
}

