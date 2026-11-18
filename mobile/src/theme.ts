/** Design tokens copied from the website (frontend/app/globals.css) so the app looks the same. */
export const colors = {
  brand900: "#123b43",
  navy900: "#172c3d",
  teal700: "#157873",
  teal500: "#38bfa7",
  mint100: "#e9f5f2",
  lavender100: "#eeeafe",
  lavender700: "#4b3bb0",
  coral500: "#f28b82",
  canvas: "#faf9f6",
  surface: "#ffffff",
  border: "#d5dde3",
  ink: "#172b36",
  inkSoft: "#566874",
  amber600: "#8f5d12",
  amber100: "#fff4d9",
  red700: "#b42332",
  red100: "#fdebec",
  blue700: "#2563a6",
  blue100: "#eaf2fc",
  success700: "#18794e",
  success100: "#e8f5ee",
};

/** The website's "high contrast" preference: stronger borders and text, flat surfaces. */
export const highContrast: typeof colors = {
  ...colors,
  border: "#172b36",
  inkSoft: "#172b36",
  teal700: "#0b4f4c",
  mint100: "#ffffff",
  canvas: "#ffffff",
  lavender100: "#ffffff",
  lavender700: "#2a1f80",
  amber600: "#5e3c05",
  amber100: "#ffffff",
  red700: "#8a1220",
  red100: "#ffffff",
  blue100: "#ffffff",
  success700: "#0f5c3a",
  success100: "#ffffff",
};

export const radius = { sm: 8, card: 14, lg: 20 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
