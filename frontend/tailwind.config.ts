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
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        line: "var(--border)",
        ink: { DEFAULT: "var(--text-primary)", soft: "var(--text-secondary)" },
        amber: { 600: "var(--amber-600)", 100: "var(--amber-100)" },
        danger: { 700: "var(--red-700)", 100: "var(--red-100)" },
        info: { 700: "var(--blue-700)", 100: "var(--blue-100)" },
        success: { 700: "var(--success-700)", 100: "var(--success-100)" },
      },
      borderRadius: { card: "14px" },
      fontFamily: {
        sans: ["Inter", "Geist Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
