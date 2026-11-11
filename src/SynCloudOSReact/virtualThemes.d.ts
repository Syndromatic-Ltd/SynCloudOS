declare module "virtual:syncloudos/themes" {
  export const themes: Readonly<Record<string, import("../NSE/hostComposition").NSETheme>>;
}
