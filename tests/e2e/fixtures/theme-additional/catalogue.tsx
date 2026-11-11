import { useEffect, useState, type ReactNode } from "react";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { SynCloudOSProvider } from "../../../../src/SynCloudOSReact";
import { WebspringQuickSwitchView } from "../../../../src/Webspring/WebspringQuickSwitchView";
import { SystemAlert } from "../../../../src/SynCloudOSReact/SystemAlert";
import { NSEAlertBackdrop } from "../../../../src/NSE/Components/NSEAlertBackdrop";
import { AppViewChrome } from "../../../../src/Webspring/AppViewChrome";
import { NSEAppFrame } from "../../../../src/NSE/Windows/NSEAppFrame";
import { NSEWindowTitlebarContent } from "../../../../src/NSE/Windows/windowTitlebarContext";
import { NSEDatePicker } from "../../../../src/NSE/DateTime/Pickers/NSEDatePicker";
import type { SynCloudOSAppInfo } from "../../../../src/SynCloudOS/AppInfo/appInfoTypes";

const noop = () => undefined;
function Runtime({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => createSynCloudOS({ id: "theme-additional", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  useEffect(() => () => { void runtime.dispose("additional parity unmounted"); }, [runtime]);
  return <SynCloudOSProvider runtime={runtime}>{children}</SynCloudOSProvider>;
}
const apps = ["Alpha", "Beta", "Gamma"].map((name, index) => ({ version: "1.0.0", bundleIdentifier: `com.example.${name.toLowerCase()}`, packageName: `com.example.${name.toLowerCase()}`, displayName: name, shortName: name, route: `/${name.toLowerCase()}`, icon: { src: "/assets/webspring/Panel.png" }, notifications: { badgeCount: index === 0 ? 2 : 0 }, isDisabled: index === 2 }) as SynCloudOSAppInfo);
const date = { year: 2026, month: 11, day: 9 }, time = { hour: 13, minute: 30, second: 0 };
export interface AdditionalThemeSurface { readonly id: string; readonly render: (scheme: "light" | "dark") => ReactNode; readonly action?: "select-next" | "disclose" }
export const additionalThemeCatalogue: readonly AdditionalThemeSurface[] = [
  ...[false, true].map(selected => ({ id: `quick-switch-${selected ? "selected" : "normal"}`, action: selected ? "select-next" as const : undefined, render: () => <Runtime><WebspringQuickSwitchView apps={apps} lifecycle={{}} open openAppIds={[apps[0]!.bundleIdentifier]} onClose={noop} /></Runtime> })),
  ...[false, true].map(disclosed => ({ id: `system-alert-${disclosed ? "details" : "normal"}`, action: disclosed ? "disclose" as const : undefined, render: (scheme: "light" | "dark") => <Runtime><NSEAlertBackdrop><SystemAlert appearance={scheme} error={{ code: "SITE_NOT_RESPONDING", scope: "site", title: "The workspace is not responding", message: "You can return to your workspace or try again.", technicalDetails: "Diagnostic code: SITE_NOT_RESPONDING\nOwner: supplementary specimen", suggestedActions: ["reload", "dismiss"] }} onDismiss={noop} onReturn={noop} onReload={noop} /></NSEAlertBackdrop></Runtime> })),
  ...[false, true].map(keyWindow => ({ id: `stage-status-${keyWindow ? "key" : "inactive"}`, render: () => <AppViewChrome.Root zIndex={1} keyWindow={keyWindow}><NSEAppFrame topBar={<NSEWindowTitlebarContent title="Documents" subtitle="3 items" toolbarStyle="unified" />} statusBar={<span>Ready</span>}><p>Document content</p></NSEAppFrame></AppViewChrome.Root> })),
  ...["textFieldAndStepper", "clockAndCalendar"].map(datePickerStyle => ({ id: `date-picker-combined-${datePickerStyle}`, render: () => <NSEDatePicker aria-label="Appointment" locale="en-GB" timeZone="Europe/London" datePickerElements={["yearMonthDay", "hourMinute"]} datePickerStyle={datePickerStyle as "textFieldAndStepper" | "clockAndCalendar"} defaultValue={{ date, time, timeZone: "Europe/London", disambiguation: "reject" }} /> })),
  ...["textFieldAndStepper", "clockAndCalendar"].map(datePickerStyle => ({ id: `date-picker-range-${datePickerStyle}`, render: () => <NSEDatePicker aria-label="Dates" locale="en-GB" timeZone="Europe/London" datePickerMode="range" datePickerStyle={datePickerStyle as "textFieldAndStepper" | "clockAndCalendar"} defaultValue={{ start: date, end: { ...date, day: 12 } }} /> })),
];
