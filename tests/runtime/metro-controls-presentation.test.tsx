// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import postcss, { type Rule } from 'postcss';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NSEGrabHandle } from '../../src/NSE/Controls/Buttons/NSEGrabHandle';
import { NSEFilePickerButton } from '../../src/NSE/FilePanels/NSEFilePickerButton';
import { NSEProgressIndicator } from '../../src/NSE/Progress/NSEProgressIndicator';
import { NSETabGroup } from '../../src/NSE/Navigation/NSETabGroup';
import { NSETooltip } from '../../src/NSE/Tooltips/NSETooltip';
import { NSEStandaloneControlHost } from '../../src/NSE/Overlays/NSEStandaloneControlHost';
import { createStaticPresentationPort } from '../fixtures/presentationTraits';
import { NSEPushButton } from '../../src/NSE/Controls/Buttons/NSEButtons';
import { NSECheckbox, NSEToggleButton, NSETextField } from '../../src/NSE/Controls/Fields/NSEFields';
import { NSESearchField } from '../../src/NSE/Controls/Fields/NSESearchField';
import { NSESecureTextField } from '../../src/NSE/Controls/Fields/NSESecureTextField';
import { NSESlider } from '../../src/NSE/Controls/Values/NSESlider';
import { NSEStepper } from '../../src/NSE/Controls/Values/NSEStepper';
import { NSETokenField } from '../../src/NSE/Controls/Completion/NSETokenField';
import { NSEPageHeader } from '../../src/NSE/Windows/Chrome/NSEPageHeader';
import { NSEProgressBar } from '../../src/NSE/Progress/NSEProgress';
import { NSEThemeProvider } from '../../src/NSE/Appearance';
import { NSETabBar, NSETabBarController } from '../../src/NSE/Navigation';
import { metroTheme } from '../../src/NSE/Themes/Metro/theme';

Object.assign(globalThis, { React });
afterEach(cleanup);
const css = postcss.parse(readFileSync('src/Themes/Metro.scostheme/Contents/Resources/metro.css', 'utf8'));
const scope = ':where([data-nse-theme="com.syndromatic.metro"], [data-nse-theme="com.syndromatic.metro"] *)';
const rules: Rule[] = [];
css.walkRules(rule => { if (rule.parent?.type === 'atrule' && rule.parent.name === 'scope') rules.push(rule); });
function declarations(selector: string) {
  const result: Record<string, string> = {};
  for (const rule of rules) {
    if (rule.selectors.some(value => value.replace(scope, '') === selector)) {
      rule.walkDecls(decl => { result[decl.prop] = decl.value; });
    }
  }
  return result;
}
function expectHook(element: Element, selector: string, property: string, value: string) {
  expect(element.matches(selector), `Rendered DOM must match ${selector}`).toBe(true);
  expect(declarations(selector)[property], `Metro rule ${selector}`).toBe(value);
}
function themed(children: React.ReactNode, dir: 'ltr' | 'rtl' = 'ltr') {
  return render(<div data-nse-theme="com.syndromatic.metro" dir={dir}>{children}</div>);
}

describe('Metro actual control hooks', () => {
  it('paints the real input well without framing its label twice', () => {
    const view = themed(<><NSETextField label="Name" defaultValue="Ada" /><NSESearchField label="Search" defaultValue="hello" /></>);
    const field = view.getByRole('textbox', { name: 'Name' });
    expectHook(field, ':is(.nse-control-field-frame,.nse-control-search-frame) input', 'border', '0');
    expectHook(field.closest('.nse-control-field-frame')!, ':is(.nse-control-field-frame,.nse-control-search-frame)', 'border', '2px solid var(--nse-metro-edge)');
    expectHook(field.closest('label')!, ':is(.nse-control-text-field,.nse-control-search-field,.nse-control-input-box)', 'background', 'transparent');
    expectHook(view.getByRole('searchbox'), ':is(.nse-control-field-frame,.nse-control-search-frame) input', 'font', '400 16px/1.3 var(--nse-metro-font)');
  });

  it('uses the published tone and press-lifetime attributes, not retired variants', () => {
    const view = themed(<NSEPushButton tone="affirmative">Apply</NSEPushButton>);
    const button = view.getByRole('button', { name: 'Apply' });
    expect(button.getAttribute('data-tone')).toBe('affirmative');
    expectHook(button, '.nse-control-button:is([data-tone="affirmative"],[data-selected="true"],[data-pressed="true"],[aria-pressed="true"])', 'background', 'var(--nse-metro-accent)');
    const selector = ':is(.nse-control-button,.nse-control-picker-button,.nse-extended-tool-button):not(:disabled):is([data-press-active="true"],:active:not([data-press-active]))';
    fireEvent.keyDown(button, { key: ' ' });
    expectHook(button, selector, 'scale', '.975');
    fireEvent.blur(button);
    expect(button.matches(selector)).toBe(false);
  });

  it('keeps native checkbox and slider hit targets while painting actual child surfaces', () => {
    const view = themed(<><NSECheckbox label="Remember" defaultChecked /><NSESlider label="Volume" defaultValue={40} /></>);
    const checkbox = view.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expectHook(checkbox.closest('label')!.querySelector('.nse-control-checkbox-art')!, '.nse-control-checkbox-art', 'width', '24px');
    const slider = view.getByRole('slider');
    expect(slider.tagName).toBe('INPUT');
    expectHook(slider.closest('label')!, '.nse-control-slider', '--nse-control-slider-thumb-size', '18px');
    expectHook(slider.closest('label')!.querySelector('.nse-control-slider-thumb-visual')!, '.nse-control-slider-thumb-visual', 'height', '24px');
    expect(declarations('.nse-control-slider-control')['transform']).toBeUndefined();
  });

  it('styles secure, token and stepper parts without replacing their semantics', () => {
    const view = themed(<><NSESecureTextField aria-label="Password" label="Password" defaultValue="secret" /><NSETokenField aria-label="Recipients" values={[{ id: 'ada', label: 'Ada' }]} createToken={label => ({ id: label, label })} onValuesChange={() => undefined} /><NSEStepper aria-label="Quantity" minimum={0} maximum={10} step={1} value={2} onValueChange={() => undefined} /></>);
    expectHook(view.getByLabelText('Password', { selector: 'input' }), '[data-nse-control="secure-text-field"] > input', 'border-radius', '0');
    const token = view.getByRole('button', { name: 'Ada, token' });
    expectHook(token, '[data-nse-control="token-field"] [data-nse-part="token"] > button', 'border-radius', '0');
    expectHook(view.getByRole('button', { name: 'Increment Quantity' }), '[data-nse-control="stepper"] > button', 'inline-size', '36px');
    expect(view.getByRole('spinbutton').getAttribute('aria-valuenow')).toBe('2');
  });

  it('uses real page-header and progress hooks', () => {
    const view = themed(<><NSEPageHeader title="Settings" kicker="Your device">Make it yours</NSEPageHeader><NSEProgressBar label="Sync" value={40} content="Downloading" /></>);
    expectHook(view.getByText('Settings'), '.nse-control-page-header-title', 'font', '300 clamp(32px,5vw,56px)/1.15 var(--nse-metro-title-font)');
    expectHook(view.getByText('Downloading'), '.nse-control-progress-content', 'position', 'relative');
    expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
  });

  it('paints actual Metro pivot buttons without an underline or bottom-tab material', () => {
    const tabs = new NSETabBarController<React.ReactNode>({ id: 'metro-hook-tabs', initialSelectedId: 'one', destinations: [{ id: 'one', label: 'One', icon: { kind: 'template', name: 'one' }, createContent: () => <p>First</p> }, { id: 'two', label: 'Two', icon: { kind: 'template', name: 'two' }, createContent: () => <p>Second</p> }] });
    const view = render(<NSEThemeProvider theme={metroTheme}><NSETabBar controller={tabs} aria-label="Sections" /></NSEThemeProvider>);
    expectHook(view.getByRole('tab', { name: 'One' }), '.nse-tab-bar .nse-tab-bar-tab[aria-selected="true"]', 'font-weight', '600');
    expect(declarations('.nse-tab-bar-tab::after')['content']).toBe('none');
    expect(declarations('.nse-tab-bar .nse-tab-bar-tab')['border']).toBe('0');
    view.unmount(); tabs.dispose();
  });
});

describe('Metro physical switch geometry in both writing directions', () => {
  it.each(['ltr', 'rtl'] as const)('retains native keyboard state and bounded thumb endpoints in %s', dir => {
    const view = themed(<NSEToggleButton aria-label="Notifications" selectionHaptic={false} />, dir);
    const control = view.getByRole('switch');
    const thumb = control.querySelector('.nse-control-toggle-thumb')!;
    expectHook(thumb, '.nse-control-toggle-thumb', 'left', '0');
    const geometry = declarations('.nse-control-toggle-thumb');
    expect(geometry.right).toBe('auto');
    expect(geometry['inset-inline-start']).toBeUndefined();
    expect(geometry['box-sizing']).toBe('border-box');
    expect(geometry.transform).toBe('translateX(calc(var(--nse-control-toggle-ratio,0) * 53px))');
    const track = declarations('.nse-control-toggle-track');
    const width = Number.parseFloat(declarations('.nse-control-toggle').width);
    const trackInnerWidth = width - Number.parseFloat(track.left) - Number.parseFloat(track.right) - 2 * Number.parseFloat(track.border);
    const thumbWidth = Number.parseFloat(geometry.width);
    // jsdom has no layout engine: verify the parsed border-box geometry against
    // the real component's emitted ratio, not a fabricated DOMRect measurement.
    expect(trackInnerWidth).toBe(72);
    for (const ratio of [0, .25, .5, .75, 1]) {
      const physicalLeft = ratio * 53;
      expect(physicalLeft).toBeGreaterThanOrEqual(0);
      expect(physicalLeft + thumbWidth).toBeLessThanOrEqual(trackInnerWidth);
    }
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.style.getPropertyValue('--nse-control-toggle-ratio')).toBe('0');
    fireEvent.keyDown(control, { key: 'ArrowRight' });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.style.getPropertyValue('--nse-control-toggle-ratio')).toBe('1');
    fireEvent.keyDown(control, { key: 'ArrowLeft' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.style.getPropertyValue('--nse-control-toggle-ratio')).toBe('0');
    expect(declarations('.nse-control-toggle-text-on').left).toBe('6px');
    expect(declarations('.nse-control-toggle-text-off').right).toBe('6px');
  });
});

describe('Metro accessibility cascade', () => {
  it('places forced-color switch paint after base geometry instead of overriding system colors later', () => {
    const children = css.nodes.find(node => node.type === 'atrule' && node.name === 'scope');
    expect(children?.type).toBe('atrule');
    if (children?.type !== 'atrule') throw new Error('Missing Metro scope');
    const nodes = children.nodes ?? [];
    const toggle = nodes.findIndex(node => node.type === 'rule' && node.selector.startsWith('.nse-control-toggle-thumb:where('));
    const forced = nodes.findIndex(node => node.type === 'atrule' && node.name === 'media' && node.params === '(forced-colors:active)');
    const reduced = nodes.findIndex(node => node.type === 'atrule' && node.name === 'media' && node.params === '(prefers-reduced-motion:reduce)');
    expect(toggle).toBeGreaterThanOrEqual(0);
    expect(forced).toBeGreaterThan(toggle);
    expect(reduced).toBeGreaterThan(toggle);
  });
});


describe('Metro secondary toolkit surfaces', () => {
  it('paints real file-picker and grip controls without changing their roles', () => {
    const view = themed(<><NSEFilePickerButton label="Choose file" meta="PNG or JPEG" /><NSEGrabHandle label="Drag pane" onDragMove={() => undefined} /></>);
    const file = view.getByRole('button', { name: /Choose file/ });
    expectHook(file, '.nse-control-file-picker-button', 'border-radius', '0');
    expectHook(view.getByText('PNG or JPEG'), '.nse-control-file-picker-meta', 'color', 'var(--nse-metro-muted)');
    const grip = view.getByRole('button', { name: 'Drag pane' });
    expectHook(grip, '.nse-control-grab-handle', 'width', '44px');
    expect(declarations('.nse-control-grab-handle::before')['border-block']).toBe('2px dotted currentColor');
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 5, clientY: 5 });
    expectHook(grip, '.nse-control-grab-handle-draggable[data-dragging="true"]', 'cursor', 'grabbing');
    fireEvent.pointerCancel(grip, { pointerId: 1 });
    expect(grip.hasAttribute('data-dragging')).toBe(false);
  });

  it('uses square selected icon tabs while retaining keyboard tab selection', () => {
    const view = themed(<NSETabGroup tabStyle="icons" showsCaptions selectionHaptic={false} label="Inspector" defaultValue="info" options={[{ value: 'info', label: 'Info', icon: <span>I</span> }, { value: 'style', label: 'Style', icon: <span>S</span> }]} />);
    expectHook(view.getByRole('tab', { name: 'Info' }), '.nse-icon-tab[aria-selected="true"]', 'background', 'var(--nse-metro-accent)');
    fireEvent.keyDown(view.getByRole('tab', { name: 'Info' }), { key: 'ArrowRight' });
    expectHook(view.getByRole('tab', { name: 'Style' }), '.nse-icon-tab[aria-selected="true"]', 'border-color', 'var(--nse-metro-accent)');
  });

  it('preserves determinate numeric values and static indeterminate ring semantics', () => {
    const view = themed(<><NSEProgressIndicator aria-label="Download" variant="circular" size={64} state={{ kind: 'determinate', value: 35, minimum: 0, maximum: 100 }} /><NSEProgressIndicator aria-label="Waiting" variant="spinner" reducedMotion state={{ kind: 'indeterminate' }} /></>);
    const circle = view.getByRole('progressbar', { name: 'Download' });
    expect(circle.getAttribute('aria-valuenow')).toBe('35');
    expect(circle.textContent).toBe('35%');
    expectHook(circle.querySelector('[data-nse-part="track"]')!, '[data-nse-control="progress-indicator"]:is([data-variant="circular"],[data-variant="spinner"]) [data-nse-part="track"]', 'border-radius', '50%');
    const spinner = view.getByRole('progressbar', { name: 'Waiting' });
    expect(spinner.hasAttribute('aria-valuenow')).toBe(false);
    expectHook(spinner.querySelector('[data-nse-part="track"]')!, '[data-nse-control="progress-indicator"]:is([data-variant="circular"],[data-variant="spinner"])[data-motion="static"] [data-nse-part="track"]', 'animation', 'none');
  });

  it('paints a real portaled tooltip under its projected Metro theme', async () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    try {
      const view = render(<NSEThemeProvider theme={metroTheme}><NSEStandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width: 1024, height: 768 })}><NSETooltip id="metro-tooltip-test" content="More information" open anchor={anchor} /></NSEStandaloneControlHost></NSEThemeProvider>);
      const tooltip = await view.findByRole('tooltip');
      expect(tooltip.getAttribute('data-nse-theme')).toBe('com.syndromatic.metro');
      expectHook(tooltip, '.nse-tooltip', 'background', 'var(--nse-metro-canvas)');
      expectHook(tooltip.querySelector('.nse-tooltip-arrow')!, '.nse-tooltip-arrow', 'display', 'none');
      view.unmount();
    } finally { anchor.remove(); }
  });
});
