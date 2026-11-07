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

import { NSEFormatter, formatterFailure, type NSEFormatterContext, type NSEFormatterResult } from "./NSEFormatter";

export type NSEDateFormatterStyle = "none" | "short" | "medium" | "long" | "full";
export interface NSEDateFormatterOptions {
  locale?: string;
  timeZone?: string;
  calendar?: string;
  dateStyle?: NSEDateFormatterStyle;
  timeStyle?: NSEDateFormatterStyle;
  dateFormat?: string;
}
type Fields = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type Part = { type: string; value: string };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numericFields = new Set(["year", "month", "day", "hour", "minute", "second"]);
const tokenTypes: Record<string, keyof Fields> = { yyyy: "year", MM: "month", dd: "day", HH: "hour", mm: "minute", ss: "second" };
function tokenize(format: string): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < format.length;) {
    if (format[i] === "'") {
      let literal = ""; i++;
      if (format[i] === "'") { parts.push({type:"literal",value:"'"}); i++; continue; }
      let closed=false;
      while (i < format.length) {
        if (format[i] === "'") { if (format[i+1] === "'") { literal += "'"; i+=2; continue; } i++; closed=true; break; }
        literal += format[i++];
      }
      if (!closed) throw new RangeError("Unterminated date format literal.");
      parts.push({type:"literal", value:literal}); continue;
    }
    if (/[A-Za-z]/.test(format[i])) {
      let end = i + 1; while (format[end] === format[i]) end++;
      const token = format.slice(i, end), type = tokenTypes[token];
      if (!type) throw new RangeError(`Unsupported date format token: ${token}`);
      parts.push({type, value:token}); i = end;
    } else { parts.push({type:"literal", value:format[i++]}); }
  }
  return parts;
}
function civil(date: Date, timeZone: string | undefined): Fields {
  const result = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23",
  }).formatToParts(date);
  const field = (type: string) => Number(result.find(p => p.type === type)!.value);
  return {year:field("year"), month:field("month"), day:field("day"), hour:field("hour"), minute:field("minute"), second:field("second")};
}
function utcValue(f: Fields): number {
  const d = new Date(0); d.setUTCFullYear(f.year, f.month-1, f.day); d.setUTCHours(f.hour, f.minute, f.second, 0); return d.getTime();
}
function resolveCivil(f: Fields, timeZone: string | undefined): Date | null {
  const target = utcValue(f);
  const check = new Date(target);
  if (check.getUTCFullYear() !== f.year || check.getUTCMonth()+1 !== f.month || check.getUTCDate() !== f.day || f.hour > 23 || f.minute > 59 || f.second > 59) return null;
  let instant = target;
  for (let i=0;i<4;i++) { const delta = target - utcValue(civil(new Date(instant), timeZone)); if (!delta) break; instant += delta; }
  const result = new Date(instant), actual = civil(result, timeZone);
  return Object.keys(f).every(key => f[key as keyof Fields] === actual[key as keyof Fields]) ? result : null;
}
function digitMaps(locale: string | undefined): [Map<string,string>, string[]] {
  const formatter = new Intl.NumberFormat(locale, {useGrouping:false});
  const digits = Array.from({length:10}, (_, i) => formatter.format(i));
  return [new Map(digits.map((d,i) => [d, String(i)])), digits];
}
/** Intl-backed NSDateFormatter with Gregorian numeric patterns and localized style parsing. */
export class NSEDateFormatter extends NSEFormatter<Date> {
  locale?: string; timeZone?: string; calendar?: string;
  dateStyle: NSEDateFormatterStyle; timeStyle: NSEDateFormatterStyle; dateFormat?: string;
  constructor(options: NSEDateFormatterOptions = {}) {
    super(); this.locale=options.locale; this.timeZone=options.timeZone; this.calendar=options.calendar;
    this.dateStyle=options.dateStyle ?? "none"; this.timeStyle=options.timeStyle ?? "none"; this.dateFormat=options.dateFormat;
  }
  #locale(context?: NSEFormatterContext): string | undefined { return context?.locale ?? this.locale; }
  #zone(context?: NSEFormatterContext): string | undefined { return context?.timeZone ?? this.timeZone; }
  #style(locale: string | undefined, timeZone: string | undefined): Intl.DateTimeFormat {
    const dateStyle = this.dateStyle === "none" ? undefined : this.dateStyle;
    const timeStyle = this.timeStyle === "none" ? undefined : this.timeStyle;
    return new Intl.DateTimeFormat(locale, {dateStyle, timeStyle, timeZone, calendar:this.calendar});
  }
  string(value: Date, context?: NSEFormatterContext): string {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new RangeError("Invalid date.");
    const locale=this.#locale(context), zone=this.#zone(context);
    if (this.dateFormat !== undefined) {
      if (this.#style(locale, zone).resolvedOptions().calendar !== "gregory") throw new RangeError("Pattern formatting only supports the Gregorian calendar.");
      const era = new Intl.DateTimeFormat("en-US-u-ca-gregory", {timeZone:zone, era:"short", year:"numeric"}).formatToParts(value).find(p=>p.type==="era")?.value;
      if (era !== "AD") throw new RangeError("Pattern formatting does not support this era.");
      const f=civil(value, zone), [, localDigits]=digitMaps(locale);
      if (f.year > 9999) throw new RangeError("Pattern formatting requires a four-digit year.");
      return tokenize(this.dateFormat).map(p => p.type === "literal" ? p.value : String(f[p.type as keyof Fields]).padStart(p.value.length,"0").replace(/\d/g, d => localDigits[Number(d)])).join("");
    }
    if (this.dateStyle === "none" && this.timeStyle === "none") return "";
    return this.#style(locale,zone).format(value);
  }
  date(text: string, context?: NSEFormatterContext): Date | null {
    if (this.calendar && this.calendar !== "gregory") throw new RangeError("Date parsing only supports the Gregorian calendar.");
    const locale=this.#locale(context), zone=this.#zone(context), [map]=digitMaps(locale);
    if (this.#style(locale, zone).resolvedOptions().calendar !== "gregory") throw new RangeError("Date parsing only supports the Gregorian calendar.");
    let parts: Part[];
    if (this.dateFormat !== undefined) parts=tokenize(this.dateFormat);
    else {
      if (this.dateStyle === "none" && this.timeStyle === "none") return null;
      parts=this.#style(locale,zone).formatToParts(new Date("2006-11-22T13:44:55Z"));
    }
    const groups: string[] = [];
    let pattern="^";
    for (const p of parts) {
      if (p.type === "literal") pattern+=escape(p.value).replace(/\s/gu, "[\\s\\u00a0\\u202f]");
      else if (numericFields.has(p.type)) { groups.push(p.type); pattern += this.dateFormat !== undefined ? `([\\p{Number}]{${p.value.length}})` : p.type === "month" ? "(.+?)" : "([\\p{Number}]+)"; }
      else if (["dayPeriod", "weekday", "era", "timeZoneName"].includes(p.type)) { groups.push(p.type); pattern += "(.+?)"; }
      else throw new RangeError(`Unsupported date parsing field: ${p.type}`);
    }
    const match=new RegExp(pattern+"$", "u").exec(text); if (!match) return null;
    const fields: Fields={year:2001, month:1, day:1, hour:0, minute:0, second:0};
    let dayPeriod: string | undefined;
    for (let i=0;i<groups.length;i++) {
      if (groups[i] === "dayPeriod") { dayPeriod=match[i+1]; continue; }
      if (["weekday", "era", "timeZoneName"].includes(groups[i])) continue;
      let raw=match[i+1]; for (const [digit, ascii] of map) raw=raw.split(digit).join(ascii);
      if (!/^\d+$/.test(raw)) {
        if (groups[i] !== "month") return null;
        const month=Array.from({length:12}, (_, monthIndex) => {
          const sample=resolveCivil({year:2006,month:monthIndex+1,day:15,hour:12,minute:0,second:0}, zone)!;
          return this.#style(locale,zone).formatToParts(sample).find(p => p.type === "month")?.value;
        }).indexOf(match[i+1]);
        if (month < 0) return null;
        fields.month=month+1; continue;
      }
      let n=Number(raw); if (this.dateFormat === undefined && groups[i] === "year" && raw.length <= 2) n+=2000;
      fields[groups[i] as keyof Fields]=n;
    }
    const hourCycle = this.dateFormat === undefined ? this.#style(locale, zone).resolvedOptions().hourCycle : undefined;
    if (groups.includes("hour") && hourCycle === "h24") {
      if (fields.hour < 1 || fields.hour > 24) return null;
      fields.hour %= 24;
    }
    if (dayPeriod !== undefined) {
      const period=(hour:number) => { const instant=resolveCivil({year:2006,month:11,day:22,hour,minute:0,second:0},zone)!; return this.#style(locale,zone).formatToParts(instant).find(p=>p.type==="dayPeriod")?.value; };
      const am=period(0), pm=period(12); if (dayPeriod !== am && dayPeriod !== pm) return null;
      if (hourCycle === "h11") {
        if (fields.hour < 0 || fields.hour > 11) return null;
      } else if (fields.hour < 1 || fields.hour > 12) return null;
      fields.hour = fields.hour % 12 + (dayPeriod === pm ? 12 : 0);
    }
    const result=resolveCivil(fields,zone);
    if (!result) return null;
    if (this.dateFormat === undefined) {
      const normalise=(value:string) => value.replace(/[\s\u00a0\u202f]+/gu, " ");
      if (normalise(this.string(result,context)) !== normalise(text)) return null;
    }
    return result;
  }
  editingString(value: Date, context?: NSEFormatterContext): string { return this.string(value,context); }
  getObjectValue(text: string, context?: NSEFormatterContext): NSEFormatterResult<Date> {
    const value=this.date(text,context); return value ? {ok:true,value} : formatterFailure("date.invalid", "Enter a valid date.", text);
  }
  isPartialStringValid(_text: string, _context?: NSEFormatterContext): {readonly valid:true} { return {valid:true}; }
}
