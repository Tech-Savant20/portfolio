import type { ThemeRegistration } from "shiki";

// Two small themes that stay inside the site palette: ink, two greys and the
// accent. Keywords and numbers carry the accent; everything else is tone.
const theme = (
  name: string,
  type: "light" | "dark",
  c: { fg: string; muted: string; subtle: string; accent: string },
): ThemeRegistration => ({
  name,
  type,
  colors: { "editor.foreground": c.fg, "editor.background": "#00000000" },
  tokenColors: [
    { settings: { foreground: c.fg } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.subtle, fontStyle: "italic" } },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "keyword.control", "constant.language"],
      settings: { foreground: c.accent },
    },
    { scope: ["constant.numeric", "constant.character.escape"], settings: { foreground: c.accent } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: c.muted } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: c.fg, fontStyle: "bold" } },
    { scope: ["variable.parameter", "variable.other.property", "support.type.property-name"], settings: { foreground: c.fg } },
    { scope: ["punctuation", "keyword.operator", "meta.brace"], settings: { foreground: c.muted } },
    { scope: ["entity.name.type", "support.class", "entity.name.class"], settings: { foreground: c.fg } },
  ],
});

export const codeThemes = {
  light: theme("portfolio-light", "light", { fg: "#121213", muted: "#4e4e53", subtle: "#66666c", accent: "#b83605" }),
  dark: theme("portfolio-dark", "dark", { fg: "#ededea", muted: "#a6a6aa", subtle: "#8a8a90", accent: "#ff6b35" }),
};
