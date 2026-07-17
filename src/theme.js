// SSC brand tokens extracted from sakestudiescenter.com (Webflow :root vars), 2026-07-16.
// Functional colors (green, gold) are darkened variants of the brand hues so text
// stays AA-readable in the runner; raw brand hues live under "identity accents".
export const C = {
  indigo: "#223661", // --denim: primary action (practice track)
  indigoDeep: "#041e3d", // --primary-1: deep navy (header, score display)
  ink: "#111112", // --gray-1: near-black text
  rice: "#f4f1ee", // --gray-4: page background
  paper: "#ffffff", // card surfaces (site uses pure white)
  hanko: "#B32A2A", // stamp red — prototype invention, kept pending a real SSC seal
  gold: "#a8763d", // --primary-4 (#d79f6e) darkened for text contrast
  mist: "#62636b", // --gray-2: muted/secondary text
  line: "#e4e0dd", // --gray-3: borders and rules
  green: "#2f8a54", // --green (#41b56f) darkened for correct-answer text
  greenBg: "#eef7f0",
  redBg: "#faeded",
  body: "#303030", // --charcoal: body copy

  // identity accents — raw brand hues for certificate / landing surfaces
  brandGreen: "#41b56f", // --green: logo mark green
  tan: "#d2c0a6", // --primary-3
  amber: "#d79f6e", // --primary-4
};

export const fontDisplay = "'DM Sans', -apple-system, 'Segoe UI', sans-serif";
export const fontBody = "'DM Sans', -apple-system, 'Segoe UI', sans-serif";
export const fontMono = "'IBM Plex Mono', 'SFMono-Regular', monospace";
// Japanese accents only (合格 / 再挑戦 stamp) — DM Sans has no JP glyphs
export const fontJp = "'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif";

export const logoHorizontal = new URL("./assets/ssc-logo-horizontal.png", import.meta.url).href;
export const logoMark = new URL("./assets/ssc-mark-256.png", import.meta.url).href;
