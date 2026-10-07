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

import { moveTo, lineTo, appendBezierCurve, closePath, type PDFOperator } from "pdf-lib";
import { GFXPath } from "../GFXPath";
export function pathOperators(path: GFXPath): PDFOperator[] {
    const out: PDFOperator[] = [];
    let point = { x: 0, y: 0 }, start = point;
    for (const command of path.commands) {
        switch (command.kind) {
            case "move":
                out.push(moveTo(command.point.x, command.point.y));
                point = start = command.point;
                break;
            case "line":
                out.push(lineTo(command.point.x, command.point.y));
                point = command.point;
                break;
            case "curve":
                out.push(appendBezierCurve(command.control1.x, command.control1.y, command.control2.x, command.control2.y, command.point.x, command.point.y));
                point = command.point;
                break;
            case "quad": {
                const c1 = { x: point.x + 2 * (command.control.x - point.x) / 3, y: point.y + 2 * (command.control.y - point.y) / 3 }, c2 = { x: command.point.x + 2 * (command.control.x - command.point.x) / 3, y: command.point.y + 2 * (command.control.y - command.point.y) / 3 };
                out.push(appendBezierCurve(c1.x, c1.y, c2.x, c2.y, command.point.x, command.point.y));
                point = command.point;
                break;
            }
            case "close":
                out.push(closePath());
                point = start;
                break;
        }
    }
    return out;
}
