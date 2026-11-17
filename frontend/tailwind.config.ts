import type { Config } from "tailwindcss";

// Design tokens from docs/DESIGN.md. Colours resolve through CSS variables so the
// high-contrast accessibility mode can override them without touching components.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 900: "var(--brand-900)" },
        navy: { 900: "var(--navy-900)" },
        teal: { 500: "var(--teal-500)", 700: "var(--teal-700)" },
        mint: { 100: "var(--mint-100)" },
        lavender: { 100: "var(--lavender-100)", 700: "var(--lavender-700)" },
        coral: { 500: "var(--coral-500)" },
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        line: "var(--border)",
        ink: { DEFAULT: "var(--text-primary)", soft: "var(--text-secondary)" },
        amber: { 600: "var(--amber-600)", 100: "var(--amber-100)", fill: "var(--amber-fill)" },
        danger: { 700: "var(--red-700)", 100: "var(--red-100)" },
        info: { 700: "var(--blue-700)", 100: "var(--blue-100)" },
        success: { 700: "var(--success-700)", 100: "var(--success-100)" },
      },
      borderRadius: { sm: "var(--radius-sm)", card: "var(--radius-card)", lg: "var(--radius-lg)" },
      boxShadow: { 1: "var(--shadow-1)", 2: "var(--shadow-2)", 3: "var(--shadow-3)" },
      zIndex: { sticky: "var(--z-sticky)", nav: "var(--z-nav)", dialog: "var(--z-dialog)", toast: "var(--z-toast)" },
      transitionDuration: { fast: "var(--motion-fast)", base: "var(--motion-base)", slow: "var(--motion-slow)" },
      transitionTimingFunction: { out: "var(--ease-out)", "in-out": "var(--ease-in-out)" },
      minHeight: { control: "var(--control-min, 44px)" },
      fontSize: {
        display: ["1.75rem", { lineHeight: "2rem", fontWeight: "700" }],
        h1: ["1.5rem", { lineHeight: "1.875rem", fontWeight: "700" }],
        h2: ["1.25rem", { lineHeight: "1.625rem", fontWeight: "600" }],
        h3: ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "600" }],
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
