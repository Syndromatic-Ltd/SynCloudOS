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

import type { CSSProperties } from "react";
import { WEBSPRING_STAGE, type SynCloudOSStagePoint } from "../SynCloudOS/SynCloudOS";

// The stage geometry lives with layout reconciliation, which places entries on the dial.
export { WEBSPRING_STAGE };

export interface ApplicationStagePresentation {
  readonly id: string;
  readonly appId: string;
  readonly title: string;
  readonly isFocused: boolean;
  readonly zIndex: number;
}

const TARGET_DESKTOP = {
  width: 1536,
  height: 960,
  ledgeY: 658,
  stageScale: 0.824,
  metalAssetRatio: 1013 / 4989
} as const;

export function getStageScale(width: number, height: number) {
  const widthScale = width / TARGET_DESKTOP.width;
  const heightScale = height / TARGET_DESKTOP.height;
  const targetScale = Math.min(widthScale, Math.max(heightScale, widthScale * 0.82)) * TARGET_DESKTOP.stageScale;
  return Math.max(0.62, Math.min(1.06, targetScale));
}

export function getDesktopWebspringLayout(width: number, height: number) {
  const stageScale = getStageScale(width, height);
  const ledgeY = Math.max(430, Math.min(height * (TARGET_DESKTOP.ledgeY / TARGET_DESKTOP.height), height - 226));
  const compositionTop = ledgeY - WEBSPRING_STAGE.shelfY * stageScale;
  const orbSize = WEBSPRING_STAGE.orbSize * stageScale;
  const artwork = WEBSPRING_STAGE.dialArtwork;
  const cutoutCenterX = width / 2 + (artwork.center.x / artwork.canvasSize - 0.5) * orbSize;
  const cutoutCenterY = ledgeY + (WEBSPRING_STAGE.orbCenter.y - WEBSPRING_STAGE.shelfY) * stageScale
    + (artwork.center.y / artwork.canvasSize - 0.5) * orbSize;
  const materialWidth = Math.max(
    width,
    TARGET_DESKTOP.width * (stageScale / TARGET_DESKTOP.stageScale),
    (ledgeY + 8) / TARGET_DESKTOP.metalAssetRatio
  );
  const cutoutSize = artwork.diameter / artwork.canvasSize * orbSize + WEBSPRING_STAGE.cutoutGap * 2 * stageScale;

  return {
    stageScale,
    ledgeY,
    compositionTop,
    cutoutCenterX,
    cutoutCenterY,
    materialWidth,
    cutoutSize
  };
}

export function stagePointStyle(point: SynCloudOSStagePoint, size = 0): CSSProperties {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: size ? `${size}px` : undefined,
    height: size ? `${size}px` : undefined
  };
}
