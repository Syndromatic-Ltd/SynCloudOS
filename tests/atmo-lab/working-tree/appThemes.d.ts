declare module "virtual:atmo-lab/app-themes" {
  export const themes: Readonly<Record<string,
    import("../../../src/NSE/Theme/NSEAppTheme").NSEAppTheme | import("../../../src/NSE/Theme/NSETheme").NSETheme>>;
}
