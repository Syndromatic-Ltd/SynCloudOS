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

import { useId } from "react";

/**
 * The colour panel's mode icons and magnifier, drawn after the Mac OS X 10.3
 * set in the Atmo vector style: a colour wheel, two slider bars, a swatch grid,
 * a picture and a crayon box. 28 by 28, full colour, as toolbar pictures are.
 */

const svgProps = { viewBox: "0 0 28 28", width: 28, height: 28, "aria-hidden": true, focusable: false } as const;

function useGradientId(name: string) {
  return `${name}-${useId().replace(/:/g, "")}`;
}

export function NSEColourWheelModeIcon() {
  const shade = useGradientId("wheel-shade");
  const segments = Array.from({ length: 24 }, (_, index) => {
    const start = (index * 15 - 90) * Math.PI / 180;
    const end = ((index + 1) * 15 - 90) * Math.PI / 180 + 0.01;
    const point = (angle: number) => `${(14 + 11.5 * Math.cos(angle)).toFixed(3)} ${(14 + 11.5 * Math.sin(angle)).toFixed(3)}`;
    return <path key={index} d={`M14 14L${point(start)}A11.5 11.5 0 0 1 ${point(end)}Z`} fill={`hsl(${(360 - index * 15) % 360} 100% 50%)`} />;
  });
  return <svg {...svgProps}>
    <defs>
      <radialGradient id={shade} cx="14" cy="14" r="11.5" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.72" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
    {segments}
    <circle cx="14" cy="14" r="11.5" fill={`url(#${shade})`} />
    <circle cx="14" cy="14" r="11.75" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="0.75" />
  </svg>;
}

export function NSEColourSlidersModeIcon() {
  const red = useGradientId("sliders-red");
  const green = useGradientId("sliders-green");
  const knob = useGradientId("sliders-knob");
  return <svg {...svgProps}>
    <defs>
      <linearGradient id={red} x1="0" x2="1"><stop offset="0" stopColor="#5a1111" /><stop offset="1" stopColor="#ff5a4e" /></linearGradient>
      <linearGradient id={green} x1="0" x2="1"><stop offset="0" stopColor="#123f14" /><stop offset="1" stopColor="#5fe05a" /></linearGradient>
      <linearGradient id={knob} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dce9fb" /><stop offset="1" stopColor="#3f7fd4" /></linearGradient>
    </defs>
    <rect x="2.5" y="3.5" width="23" height="21" rx="2.5" fill="#f4f5f7" stroke="rgba(0,0,0,0.35)" strokeWidth="0.75" />
    <rect x="5" y="8" width="18" height="3.5" rx="1.75" fill={`url(#${red})`} />
    <rect x="5" y="16.5" width="18" height="3.5" rx="1.75" fill={`url(#${green})`} />
    <path d="M14.5 6.5h3v3.2l-1.5 2.3-1.5-2.3z" fill={`url(#${knob})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
    <path d="M8.5 15h3v3.2l-1.5 2.3-1.5-2.3z" fill={`url(#${knob})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
  </svg>;
}

export function NSEColourPalettesModeIcon() {
  const colours = ["#e8322b", "#f4c230", "#3aa83c", "#2f6fd6", "#8b3fc2", "#f07c1f", "#1b1b1b", "#8d8d8d", "#ffffff"];
  return <svg {...svgProps}>
    <rect x="2.5" y="3.5" width="23" height="21" rx="2" fill="#e9eaec" stroke="rgba(0,0,0,0.4)" strokeWidth="0.75" />
    {colours.map((colour, index) => <rect key={colour} x={5 + (index % 3) * 6.2} y={6 + Math.floor(index / 3) * 5.6} width="5" height="4.6" fill={colour} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />)}
  </svg>;
}

export function NSEColourImageModeIcon() {
  const sky = useGradientId("image-sky");
  const hill = useGradientId("image-hill");
  return <svg {...svgProps}>
    <defs>
      <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f5fbf" /><stop offset="1" stopColor="#a9d4f5" /></linearGradient>
      <linearGradient id={hill} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6cbf3a" /><stop offset="1" stopColor="#2f6f1c" /></linearGradient>
    </defs>
    <rect x="2.5" y="4.5" width="23" height="19" rx="1.5" fill="#fbfbfb" stroke="rgba(0,0,0,0.45)" strokeWidth="0.75" />
    <rect x="4.5" y="6.5" width="19" height="15" fill={`url(#${sky})`} />
    <circle cx="19" cy="10.5" r="2" fill="#ffe36a" />
    <path d="M4.5 21.5v-5c3-3.2 5.6-4 8.4-1.6 2.2-2.4 6.4-3.4 10.6.6v6z" fill={`url(#${hill})`} />
  </svg>;
}

export function NSEColourCrayonsModeIcon() {
  const box = useGradientId("crayons-box");
  const tips = ["#d8322b", "#f2b531", "#3aa83c", "#2f6fd6", "#8b3fc2"];
  return <svg {...svgProps}>
    <defs>
      <linearGradient id={box} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd23f" /><stop offset="1" stopColor="#e39b16" /></linearGradient>
    </defs>
    {tips.map((colour, index) => {
      const x = 5.2 + index * 3.9;
      return <g key={colour}>
        <path d={`M${x} 13.5v-5.5l1.6-4 1.6 4v5.5z`} fill={colour} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
      </g>;
    })}
    <path d="M3.5 12.5h21l-1.5 12h-18z" fill={`url(#${box})`} stroke="rgba(120,70,0,0.7)" strokeWidth="0.75" />
    <path d="M6 17.5h16" stroke="#2f7a3a" strokeWidth="2.2" />
  </svg>;
}

export function NSEColourMagnifierIcon() {
  const glass = useGradientId("magnifier-glass");
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable={false}>
    <defs>
      <radialGradient id={glass} cx="7.4" cy="6.2" r="7" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#c9d3de" /></radialGradient>
    </defs>
    <path d="M11.7 11.7l5.6 5.6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="7.8" cy="7.8" r="5.4" fill={`url(#${glass})`} stroke="currentColor" strokeWidth="1.8" />
  </svg>;
}
