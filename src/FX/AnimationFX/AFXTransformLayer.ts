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

import { AFXLayer } from "./AFXLayer";

/**
 * A layer whose sublayers share one three-dimensional space, after `CATransformLayer`.
 *
 * An ordinary layer flattens its sublayers: they draw in `zPosition` order, later over earlier, and never cut into
 * one another. The sublayers of a transform layer keep their depth instead, so two that cross in space intersect
 * where they cross, and a nearer one hides a farther one whatever their order. Nested transform layers extend the
 * same space. A transform layer draws no contents of its own.
 */
export class AFXTransformLayer extends AFXLayer {}
