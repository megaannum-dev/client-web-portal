import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — Vibrant Orange
        primary: {
          DEFAULT: "#f27405",
          foreground: "#ffffff",
          container: "#f27405",
          "on-container": "#522300",
          fixed: "#ffdbc8",
          "fixed-dim": "#ffb68b",
          "on-fixed": "#321200",
          "on-fixed-variant": "#753400",
          inverse: "#ffb68b",
        },
        // Surface scale — light neutral backgrounds
        surface: {
          DEFAULT: "#f8f9fa",
          dim: "#d9dadb",
          bright: "#f8f9fa",
          lowest: "#ffffff",
          low: "#f3f4f5",
          container: "#edeeef",
          high: "#e7e8e9",
          highest: "#e1e3e4",
          variant: "#e1e3e4",
          tint: "#994700",
        },
        // On-surface text roles
        "on-surface": {
          DEFAULT: "#191c1d",
          variant: "#584236",
          inverse: "#f0f1f2",
        },
        // Borders / outlines
        outline: {
          DEFAULT: "#8b7264",
          variant: "#dfc0b0",
        },
        // Secondary — muted charcoal
        secondary: {
          DEFAULT: "#5f5e5e",
          foreground: "#ffffff",
          container: "#e2dfdf",
          "on-container": "#636262",
          fixed: "#e5e2e1",
          "fixed-dim": "#c8c6c6",
          "on-fixed": "#1c1b1c",
          "on-fixed-variant": "#474647",
        },
        // Tertiary
        tertiary: {
          DEFAULT: "#585f6c",
          foreground: "#ffffff",
          container: "#9198a6",
          "on-container": "#29303c",
          fixed: "#dce3f2",
          "fixed-dim": "#c0c7d6",
          "on-fixed": "#151c27",
          "on-fixed-variant": "#404753",
        },
        // Semantic
        error: {
          DEFAULT: "#ba1a1a",
          foreground: "#ffffff",
          container: "#ffdad6",
          "on-container": "#93000a",
        },
        // Legacy aliases kept for existing code
        brand: { DEFAULT: "#f27405", foreground: "#ffffff" },
        corporate: { DEFAULT: "#5f5e5e", muted: "#e2dfdf" },
        background: "#f8f9fa",
        foreground: "#191c1d",
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        hanken: ["var(--font-hanken)", "sans-serif"],
      },
      fontSize: {
        // DESIGN.md typography scale
        "headline-xl": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["28px", { lineHeight: "36px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
        "headline-lg-mobile": ["24px", { lineHeight: "32px", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      spacing: {
        // Named spacing from DESIGN.md (in addition to Tailwind defaults)
        "stack-xs": "4px",
        "stack-sm": "12px",
        "stack-md": "24px",
        "stack-lg": "48px",
        "sidebar-w": "256px",
        "header-h": "64px",
        "container-max": "1440px",
        gutter: "24px",
      },
      maxWidth: {
        container: "1440px",
      },
      boxShadow: {
        card: "0px 4px 12px rgba(0,0,0,0.05)",
        overlay: "0px 8px 24px rgba(0,0,0,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
