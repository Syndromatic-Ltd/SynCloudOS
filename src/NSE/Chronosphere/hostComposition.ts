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

/**
 * Chronosphere, the version archive. Any SynWare presents its history through `Chronosphere` and
 * chooses how it is drawn: the Vortex, the grid, or a view of its own.
 */
export { Chronosphere, type ChronosphereCapture, type ChronospherePreparation, type ChronosphereProps } from "./Chronosphere";
export { ChronosphereVortexView } from "./ChronosphereVortexView";
export { ChronosphereGridView } from "./ChronosphereGridView";
export {
  defaultChronosphereLabels,
  type ChronosphereDetailContext,
  type ChronosphereDetailRenderer,
  type ChronosphereFaceContext,
  type ChronosphereFaceRenderer,
  type ChronosphereLabels,
  type ChronospherePreparationContext,
  type ChronosphereRect,
  type ChronosphereViewActions,
  type ChronosphereViewComponent,
  type ChronosphereViewModel,
  type ChronosphereViewProps,
} from "./chronosphereViewTypes";
export {
  createChronosphereAppSubject,
  defaultChronosphereSubject,
  type ChronosphereCardShape,
  type ChronosphereLayout,
  type ChronosphereSubject,
  type ChronosphereSubjectKind,
} from "./chronosphereSubject";
export { sortChronosphereEntriesNewestFirst } from "./chronosphereStackLayout";
export type { ChronosphereVersion } from "./chronosphereTypes";
export { VortexEffect } from "./Vortex/VortexEffect";
export { loadVortexImages, type VortexImages } from "./Vortex/loadVortexImages";
export type { VortexLayerProps, VortexPresetName, ReducedMotionBehavior as VortexReducedMotion } from "./Vortex/vortexTypes";
export { ChronosphereEnvironmentProvider } from "./chronosphereEnvironment";
export type { ChronosphereEnvironment } from "./chronosphereEnvironment";
