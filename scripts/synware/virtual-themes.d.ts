declare module "virtual:syncloudos/themes" {
  export const themes: Readonly<Record<string, import("@syndromatic/syncloudos/nse/theme").NSETheme | import("@syndromatic/syncloudos/nse/theme").NSEAppTheme>>;
}
