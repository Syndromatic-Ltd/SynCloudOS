import type { ReactNode } from "react";
import { NSEButton, type NSEButtonProps } from "../../../../src/NSE/Controls/Buttons/NSEButton";
import { NSEBox, NSESwitch, NSETextField } from "../../../../src/NSE/Controls/Fields/NSEFields";
import { NSESearchField } from "../../../../src/NSE/Controls/Fields/NSESearchField";
import { NSESlider } from "../../../../src/NSE/Controls/Values/NSESlider";
import { NSESegmentedControl } from "../../../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSELevelIndicator } from "../../../../src/NSE/Controls/Values/NSELevelIndicator";
import { NSEStepper } from "../../../../src/NSE/Controls/Values/NSEStepper";
import { NSEPopUpButton } from "../../../../src/NSE/Menus/NSEPopUpButton";
import { NSEDatePicker } from "../../../../src/NSE/DateTime/Pickers/NSEDatePicker";
import { NSEProgressIndicator } from "../../../../src/NSE/Progress/NSEProgressIndicator";
import { NSEStackView } from "../../../../src/NSE/Layout/NSEStackView";
import { NSEGridView, NSEGridRow } from "../../../../src/NSE/Layout/NSEGridView";
import { NSESplitView } from "../../../../src/NSE/DataViews/Split/NSESplitView";
import { NSEDrawer } from "../../../../src/NSE/Containers/NSEContainers";
import { NSEScrollView } from "../../../../src/NSE/Scroll/NSEScrollView";
import { NSEView } from "../../../../src/NSE/Views/NSEView";
import { NSETopBar } from "../../../../src/NSE/Windows/Chrome/NSETopBar";
import { LoginWindow } from "../../../../src/NSE/SystemUI/LoginWindow";
import { NSEAboutDialog, NSEConfirmDialog } from "../../../../src/NSE/Components/NSESystemDialogs";
import { NSEPreferencesToast } from "../../../../src/NSE/Components/NSEPreferencesToast";
import { extendedThemeBaselineCatalogue } from "./extended";
import { systemThemeBaselineCatalogue } from "./system";
import { panelThemeBaselineCatalogue } from "./panels";
import { filePanelThemeBaselineCatalogue } from "./file-panels";
import { remainingThemeBaselineCatalogue } from "./remaining";

export interface ThemeBaselineSurface {
  readonly id: string;
  readonly render: () => ReactNode;
  readonly interaction?: "hover" | "press" | "focus" | "open" | "folder";
  readonly ready?: string;
  readonly chooseTab?: string;
  readonly viewport?: { width: number; height: number };
  readonly fullPage?: boolean;
}
const surfaces: ThemeBaselineSurface[] = [];
const add = (id: string, render: () => ReactNode, extra: Partial<ThemeBaselineSurface> = {}) => surfaces.push({ id, render, ...extra });
const noop = () => undefined;
const image = <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="2" /></svg>;
const states = ["normal", "hover", "highlighted", "on", "off", "mixed", "disabled", "focused"] as const;

// One real component instance per capture. Interactive states use real browser input.
for (const bezelStyle of ["rounded", "texturedRounded", "disclosure"] as const) {
  for (const controlSize of ["small", "regular", "large"] as const) {
    for (const buttonType of ["momentaryPushIn", "pushOnPushOff", "toggle", "switch"] as const) {
      for (const state of states) {
        const props: NSEButtonProps = { title: "Continue", bezelStyle, controlSize, buttonType, isEnabled: state !== "disabled",
          isHighlighted: state === "highlighted", state: state === "on" || state === "mixed" ? state : "off", onStateChange: noop };
        add(`button-${bezelStyle}-${controlSize}-${buttonType}-${state}`, () => <NSEButton {...props} />,
          { interaction: state === "hover" ? "hover" : state === "focused" ? "focus" : undefined });
      }
    }
  }
}
for (const position of ["imageOnly", "imageLeading", "imageTrailing"] as const) {
  for (const state of ["normal", "hover", "press", "focused", "disabled"] as const) {
    add(`button-${position}-${state}`, () => <NSEButton title="Add item" image={image} imagePosition={position} isEnabled={state !== "disabled"} />,
      { interaction: state === "normal" || state === "disabled" ? undefined : state === "focused" ? "focus" : state });
  }
}
for (const special of ["default", "destructive", "aqua", "darkAqua"] as const) {
  for (const state of ["normal", "press", "disabled", "focused"] as const) {
    add(`button-${special}-${state}`, () => <NSEButton title="Continue" keyEquivalent={special === "default" ? "\r" : undefined}
      hasDestructiveAction={special === "destructive"} appearance={special === "aqua" || special === "darkAqua" ? special : undefined} isEnabled={state !== "disabled"} />,
    { interaction: state === "focused" ? "focus" : state === "press" ? "press" : undefined });
  }
}
for (const state of ["on", "off"] as const) for (const thumbMaterial of ["standard", "metal"] as const) for (const disabled of [false, true]) {
  add(`switch-${thumbMaterial}-${state}-${disabled ? "disabled" : "enabled"}`, () => <NSESwitch aria-label="Automatic updates" state={state} thumbMaterial={thumbMaterial} isEnabled={!disabled} onStateChange={noop} />);
}
for (const controlSize of ["regular", "small", "mini"] as const) {
  for (const state of ["normal", "hover", "focused", "disabled", "invalid", "empty"] as const) {
    add(`text-field-${controlSize}-${state}`, () => <NSETextField aria-label="Name" defaultValue={state === "empty" ? "" : "SynCloudOS"} placeholder="Name" controlSize={controlSize} isEnabled={state !== "disabled"} invalid={state === "invalid"} />,
      { interaction: state === "hover" ? "hover" : state === "focused" ? "focus" : undefined });
  }
  for (const sliderType of ["linear", "circular"] as const) for (const state of ["normal", "focused", "disabled", "minimum", "maximum"] as const) {
    add(`slider-${sliderType}-${controlSize}-${state}`, () => <NSESlider aria-label="Volume" value={state === "minimum" ? 0 : state === "maximum" ? 100 : 45} minimum={0} maximum={100} step={1} controlSize={controlSize} sliderType={sliderType} isEnabled={state !== "disabled"} onValueChange={noop} />,
      { interaction: state === "focused" ? "focus" : undefined });
  }
}
for (const controlSize of ["regular", "small"] as const) {
  for (const state of ["normal", "hover", "focused", "disabled", "empty"] as const) {
    add(`search-field-${controlSize}-${state}`, () => <NSESearchField aria-label="Search" defaultValue={state === "empty" ? "" : "Documents"} controlSize={controlSize} isEnabled={state !== "disabled"} showsSearchIcon />,
      { interaction: state === "hover" ? "hover" : state === "focused" ? "focus" : undefined });
  }
  for (const segmentStyle of ["rounded", "capsule", "texturedRounded"] as const) for (const state of ["normal", "hover", "press", "focused", "disabled"] as const) {
    add(`segmented-control-${segmentStyle}-${controlSize}-${state}`, () => <NSESegmentedControl aria-label="View" segmentStyle={segmentStyle} controlSize={controlSize}
      items={[{ id: "one", label: "One" }, { id: "two", label: "Two" }, { id: "three", label: "Three" }]}
      selection={{ mode: "select-one", selectedIds: new Set(["one"]), allowsEmpty: false }} onSelectionChange={noop} isEnabled={state !== "disabled"} />,
      { interaction: state === "normal" || state === "disabled" ? undefined : state === "focused" ? "focus" : state });
  }
  for (const pullsDown of [false, true]) for (const state of ["normal", "hover", "focused", "disabled", "open"] as const) {
    add(`pop-up-button-${controlSize}-${pullsDown ? "pull-down" : "pop-up"}-${state}`, () => <NSEPopUpButton accessibleLabel="Arrange" label="Arrange" title="Arrange" pullsDown={pullsDown} controlSize={controlSize}
      defaultValue="name" items={[{ title: "Name", value: "name" }, { title: "Date", value: "date" }, { isSeparatorItem: true }, { title: "Size", value: "size", isEnabled: false }]} isEnabled={state !== "disabled"} />,
      { interaction: state === "hover" ? "hover" : state === "focused" ? "focus" : state === "open" ? "open" : undefined, fullPage: state === "open" });
  }
}
for (const mode of ["continuous", "discrete", "capacity", "rating"] as const) for (const state of ["normal", "warning", "critical", "disabled"] as const) {
  add(`level-indicator-${mode}-${state}`, () => <NSELevelIndicator aria-label="Capacity" mode={mode} value={state === "critical" ? 95 : state === "warning" ? 75 : 35} minimum={0} maximum={100} warningValue={70} criticalValue={90} isEnabled={state !== "disabled"} />);
}
for (const state of ["normal", "disabled", "focused"] as const) add(`stepper-${state}`, () => <NSEStepper aria-label="Count" value={3} minimum={0} maximum={10} step={1} isEnabled={state !== "disabled"} onValueChange={noop} />, { interaction: state === "focused" ? "focus" : undefined });
for (const datePickerStyle of ["textFieldAndStepper", "textField", "clockAndCalendar"] as const) for (const disabled of [false, true]) {
  add(`date-picker-${datePickerStyle}-${disabled ? "disabled" : "enabled"}`, () => <NSEDatePicker aria-label="Date" locale="en-GB" timeZone="Europe/London" defaultValue={{ year: 2026, month: 11, day: 9 }} today={{ year: 2026, month: 11, day: 9 }} datePickerStyle={datePickerStyle} isEnabled={!disabled} />);
  add(`time-picker-${datePickerStyle}-${disabled ? "disabled" : "enabled"}`, () => <NSEDatePicker aria-label="Time" locale="en-GB" timeZone="Europe/London" datePickerElements={["hourMinute"]} defaultValue={{ hour: 13, minute: 30, second: 0 }} datePickerStyle={datePickerStyle} isEnabled={!disabled} />);
}
for (const boxType of ["primary", "secondary", "separator", "custom"] as const) for (const titlePosition of ["noTitle", "aboveTop", "atTop", "belowTop", "aboveBottom", "atBottom", "belowBottom"] as const) {
  add(`box-${boxType}-${titlePosition}`, () => <NSEBox title="Options" boxType={boxType} titlePosition={titlePosition}>{boxType === "separator" ? undefined : <NSETextField isEditable={false}>Window content</NSETextField>}</NSEBox>);
}
for (const controlSize of ["small", "regular", "large"] as const) for (const style of ["bar", "spinning"] as const) for (const isIndeterminate of [false, true]) {
  add(`progress-indicator-${style}-${controlSize}-${isIndeterminate ? "indeterminate" : "determinate"}`, () => <NSEProgressIndicator aria-label="Progress" style={style} controlSize={controlSize} value={45} isIndeterminate={isIndeterminate} />);
}
add("stack-view", () => <NSEStackView><NSEButton title="First" /><NSEButton title="Second" /></NSEStackView>);
add("grid-view", () => <NSEGridView><NSEGridRow><NSETextField isEditable={false}>Name</NSETextField><NSETextField aria-label="Name" defaultValue="SynCloudOS" /></NSEGridRow></NSEGridView>);
add("split-view", () => <NSESplitView sidebar={<p>Source list</p>} defaultSidebarWidth={208} style={{ height: 300 }}><p>Content</p></NSESplitView>);
for (const placement of ["leading", "trailing", "top", "bottom"] as const) add(`drawer-${placement}`, () => <NSEDrawer title="Inspector" open placement={placement}><p>Details</p></NSEDrawer>);
add("scroll-view", () => <NSEScrollView style={{ height: 240 }} verticalScrollerPolicy="always"><div style={{ height: 600 }}>Scrolling content</div></NSEScrollView>);
add("view", () => <NSEView><p>Window content</p></NSEView>);
for (const variant of ["atmoCumulus", "atmoMetal"] as const) for (const scheme of ["light", "dark"] as const) {
  add(`top-bar-${variant}-${scheme}`, () => <NSETopBar title="Documents" variant={variant} scheme={scheme} leadingItems={[{ kind: "webspring", label: "Home" }]} trailingItems={[{ kind: "settings", label: "Settings" }]} />);
}
for (const state of ["normal", "error", "loading"] as const) add(`login-window-${state}`, () => <LoginWindow title="SynCloudOS" methods={[{ id: "example", label: "Continue" }]} authenticationStatus={state === "loading" ? "authenticating" : "signedOut"} error={state === "error" ? "Sign-in failed. Try again." : undefined} />, { fullPage: true });
add("about", () => <NSEAboutDialog open info={{ name: "SynCloudOS", version: "1.0.0", build: "Beta 2", tagline: "Your workspace", copyright: "© 2026 Syndromatic Ltd.", trademark: "SynCloudOS" }} onDismiss={noop} />, { fullPage: true });
add("confirm-dialog", () => <NSEConfirmDialog open title="Delete document?" message="This action cannot be undone." confirmLabel="Delete" cancelLabel="Cancel" onConfirm={noop} onCancel={noop} />, { fullPage: true });
add("settings", () => <NSEPreferencesToast open title="Settings" backLabel="Back" onClose={noop} panes={[
  { id: "appearance", label: "Appearance", meta: "Automatic", render: () => <NSESwitch aria-label="Dark appearance" /> },
  { id: "notifications", label: "Notifications", meta: "Enabled", render: () => <NSESwitch aria-label="Allow notifications" state="on" /> },
]} />, { fullPage: true });

export const themeBaselineCatalogue: readonly ThemeBaselineSurface[] = Object.freeze([...surfaces, ...extendedThemeBaselineCatalogue(), ...systemThemeBaselineCatalogue(), ...panelThemeBaselineCatalogue(), ...filePanelThemeBaselineCatalogue(), ...remainingThemeBaselineCatalogue()]);
