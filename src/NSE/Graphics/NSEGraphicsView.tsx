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

import { imagePNGDataURL } from "../../FX/GraphicsFX/imagePNG";
import { assertDisplayListImagePaintBudget, imagePaintRuns } from "../../FX/GraphicsFX/imagePaintRuns";
import React, { useId, useMemo } from "react";
import type { GFXBlendMode, GFXCommand, GFXCommandState, GFXDisplayList, GFXPaint, GFXPaintGradient, GFXPaintPattern, GFXImageMask, GFXImage, GFXFillRule } from "../../FX/GraphicsFX/public";
import { assertGFXDisplayList, createGFXViewIdentifierScope } from "../../FX/GraphicsFX/displayListAuthority";
import { issueGFXDefinitionId } from "../../FX/GraphicsFX/identifierAuthority";
export interface NSEGraphicsViewProps {
    readonly displayList: GFXDisplayList;
    readonly label: string;
    readonly description?: string;
    readonly className?: string;
}
function Gradient({ paint, id }: {
    paint: GFXPaintGradient;
    id: string;
}) {
    return paint.geometry.kind === "linear"
        ? <linearGradient colorInterpolation="sRGB" gradientUnits={paint.units} gradientTransform={transformValue(paint.transform)} id={id} x1={paint.geometry.start.x} y1={paint.geometry.start.y} x2={paint.geometry.end.x} y2={paint.geometry.end.y}>{paint.stops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={stop.css}/>)}</linearGradient>
        : <radialGradient colorInterpolation="sRGB" gradientUnits={paint.units} gradientTransform={transformValue(paint.transform)} id={id} cx={paint.geometry.centre.x} cy={paint.geometry.centre.y} r={paint.geometry.radius}>{paint.stops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={stop.css}/>)}</radialGradient>;
}
function transformValue(transform: GFXCommandState["transform"]) {
    return `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.tx} ${transform.ty})`;
}
function paintValue(paint: GFXPaint, ids: ReadonlyMap<string, string>) {
    return paint.kind === "colour" ? paint.css : `url(#${ids.get(`${paint.kind}:${paint.id}`)!})`;
}
function svgBlendMode(mode: GFXBlendMode): React.CSSProperties["mixBlendMode"] {
    if (mode !== "multiply" && mode !== "screen" && mode !== "overlay" && mode !== "darken" && mode !== "lighten")
        throw new TypeError(`NSE SVG rendering does not support Porter-Duff blend mode ${mode}.`);
    return mode;
}
export function NSEGraphicsView({ displayList, label, description, className }: NSEGraphicsViewProps) {
    assertGFXDisplayList(displayList);
    assertDisplayListImagePaintBudget(displayList);
    const descriptionId = useId();
    const definitions = useMemo(() => {
        const patterns = new Map<string, GFXPaintPattern>();
        const masks = new Map<string, GFXImageMask>();
        const gradients = new Map<string, GFXPaintGradient>();
        const clips = new Map<string, {
            pathData: string;
            rule: GFXFillRule;
        }>();
        const shadows = new Map<string, NonNullable<GFXCommandState["shadow"]>>();
        const leafCommands: GFXCommand[] = [];
        const collectLeaves = (commands: readonly GFXCommand[]) => {
            for (const command of commands) {
                if (command.kind === "transparency-group") collectLeaves(command.commands);
                else leafCommands.push(command);
            }
        };
        collectLeaves(displayList.commands);
        for (const command of leafCommands) {
            if (command.kind === "transparency-group") continue;
            for (const paint of [command.state.fill, command.state.stroke])
                if (paint.kind === "gradient")
                    gradients.set(paint.id, paint);
            for (const paint of [command.state.fill, command.state.stroke])
                if (paint.kind === "pattern")
                    patterns.set(paint.id, paint);
            for (const mask of command.state.masks)
                masks.set(mask.id, mask);
            for (const [index, pathData] of command.state.clipPathDataChain.entries())
                clips.set(`${command.state.clipRules[index]}:${pathData}`, { pathData, rule: command.state.clipRules[index]! });
            if (command.state.shadow)
                shadows.set(JSON.stringify(command.state.shadow), command.state.shadow);
        }
        const scope = createGFXViewIdentifierScope(displayList);
        const ids = new Map<string, string>();
        for (const key of [
            ...Array.from(patterns.keys(), id => `pattern:${id}`),
            ...Array.from(masks.keys(), id => `mask:${id}`),
            ...Array.from(gradients.keys(), (id) => `gradient:${id}`),
            ...Array.from(clips.keys(), (path) => `clip:${path}`),
            ...Array.from(shadows.keys(), (shadow) => `shadow:${shadow}`),
        ]) {
            const id = issueGFXDefinitionId(scope);
            if (!id || id.length > 1024 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || Array.from(ids.values()).includes(id)) {
                throw new TypeError("Generated graphics identifier is invalid or duplicated.");
            }
            ids.set(key, id);
        }
        return { gradients, patterns, masks, clips, shadows, ids };
    }, [displayList]);
    const stateProps = (state: GFXCommandState) => ({
        opacity: state.alpha,
        transform: transformValue(state.transform),
        ...(state.shadow ? { filter: `url(#${definitions.ids.get(`shadow:${JSON.stringify(state.shadow)}`)!})` } : {}),
        ...(state.blendMode === "normal" ? {} : { style: { mixBlendMode: svgBlendMode(state.blendMode) } }),
    });
    const renderCommand = (command: GFXCommand, key: React.Key): React.ReactNode => {
        if (command.kind === "transparency-group") {
            const style = command.group.blendMode === "normal"
                ? { isolation: "isolate" as const }
                : { isolation: "isolate" as const, mixBlendMode: svgBlendMode(command.group.blendMode) };
            return <g key={key} data-gfx-transparency-group={command.group.id} opacity={command.group.alpha} style={style}>{command.commands.map((child, index) => renderCommand(child, `${String(key)}:${index}`))}</g>;
        }
        const common = stateProps(command.state);
        const node = command.kind === "fill-path"
            ? <path d={command.pathData} fill={paintValue(command.paint, definitions.ids)} fillRule={command.fillRule} {...common}/>
            : command.kind === "stroke-path"
                ? <path d={command.pathData} fill="none" stroke={paintValue(command.paint, definitions.ids)} strokeWidth={command.lineWidth} strokeLinecap={command.lineCap} strokeLinejoin={command.lineJoin} strokeDashoffset={command.state.lineDashPhase} strokeMiterlimit={command.state.miterLimit} strokeDasharray={command.lineDash.length ? command.lineDash.join(" ") : undefined} {...common}/>
                : command.kind === "image" ? <image x={command.destination.x} y={command.destination.y} width={command.destination.width} height={command.destination.height} preserveAspectRatio="none" href={imagePNGDataURL(command.image)} {...common} style={{ ...common.style, imageRendering: command.state.interpolation === "nearest" ? "pixelated" : "auto" }}/>
                    : <text x={command.origin.x} y={command.origin.y} fill={paintValue(command.paint, definitions.ids)} fontFamily={command.font.family} fontSize={command.font.size} fontWeight={command.font.weight} fontStyle={command.font.style} letterSpacing={command.textAttributes.letterSpacing} textAnchor={command.textAttributes.alignment} {...common}>{command.text}</text>;
        return command.state.clipPathDataChain.reduceRight<React.ReactNode>((child, pathData, clipIndex) => <g key={`${String(key)}:clip:${clipIndex}`} clipPath={`url(#${definitions.ids.get(`clip:${command.state.clipRules[clipIndex]}:${pathData}`)!})`}>{child}</g>, command.state.masks.reduceRight<React.ReactNode>((child, mask, maskIndex) => <g key={`${String(key)}:mask:${maskIndex}`} mask={`url(#${definitions.ids.get(`mask:${mask.id}`)!})`}>{child}</g>, React.cloneElement(node, { key })));
    };
    return <svg className={className} role="img" aria-label={label} aria-describedby={description ? descriptionId : undefined} width={displayList.size.width} height={displayList.size.height} viewBox={`0 0 ${displayList.size.width} ${displayList.size.height}`}>
    {description ? <desc id={descriptionId}>{description}</desc> : null}
    {definitions.ids.size ? <defs>
      {Array.from(definitions.gradients.values(), (paint) => <Gradient key={paint.id} paint={paint} id={definitions.ids.get(`gradient:${paint.id}`)!}/>)}
      {Array.from(definitions.patterns.values(), paint => <pattern key={paint.id} id={definitions.ids.get(`pattern:${paint.id}`)!} patternUnits="userSpaceOnUse" width={paint.image.width} height={paint.image.height} patternTransform={transformValue(paint.transform)}><image width={paint.image.width} height={paint.image.height} href={imagePNGDataURL(paint.image)} style={{ imageRendering: paint.interpolation === "nearest" ? "pixelated" : "auto" }}/></pattern>)}
      {Array.from(definitions.masks.values(), mask => <mask key={mask.id} id={definitions.ids.get(`mask:${mask.id}`)!} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={0} y={0} width={displayList.size.width} height={displayList.size.height} style={{ maskType: "alpha" }}><g transform={transformValue(mask.transform)}><g transform={`translate(${mask.rect.x} ${mask.rect.y}) scale(${mask.rect.width / mask.image.width} ${mask.rect.height / mask.image.height})`}><PixelRuns image={mask.image} alphaOnly/></g></g></mask>)}
      {Array.from(definitions.clips.entries(), ([key, clip]) => <clipPath key={key} id={definitions.ids.get(`clip:${key}`)!} clipPathUnits="userSpaceOnUse"><path d={clip.pathData} clipRule={clip.rule}/></clipPath>)}
      {Array.from(definitions.shadows.entries(), ([key, shadow]) => <filter key={key} id={definitions.ids.get(`shadow:${key}`)!} x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx={shadow.offset.x} dy={shadow.offset.y} stdDeviation={(shadow.blur + shadow.spread) / 2} floodColor={shadow.css}/></filter>)}
    </defs> : null}
    {displayList.commands.map((command, index) => renderCommand(command, index))}
  </svg>;
}
function PixelRuns({ image, alphaOnly = false }: {
    image: GFXImage;
    alphaOnly?: boolean;
}) {
    return <>{imagePaintRuns(image, alphaOnly).map((run, index) => <rect key={index} x={run.x} y={run.y} width={run.width} height={1} fill={run.css} fillOpacity={run.alpha}/>)}</>;
}
