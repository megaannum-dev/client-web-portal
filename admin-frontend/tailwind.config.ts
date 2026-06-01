import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        colors: {
            // Primary brand — Vibrant Orange
            primary: {
              DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
              foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
              container: "rgb(var(--color-primary-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-primary-on-container) / <alpha-value>)",
              fixed: "rgb(var(--color-primary-fixed) / <alpha-value>)",
              "fixed-dim": "rgb(var(--color-primary-fixed-dim) / <alpha-value>)",
              "on-fixed": "rgb(var(--color-primary-on-fixed) / <alpha-value>)",
              "on-fixed-variant": "rgb(var(--color-primary-on-fixed-variant) / <alpha-value>)",
              inverse: "rgb(var(--color-primary-inverse) / <alpha-value>)",
            },
            // Surface scale — light neutral backgrounds
            surface: {
              DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
              dim: "rgb(var(--color-surface-dim) / <alpha-value>)",
              bright: "rgb(var(--color-surface-bright) / <alpha-value>)",
              lowest: "rgb(var(--color-surface-lowest) / <alpha-value>)",
              low: "rgb(var(--color-surface-low) / <alpha-value>)",
              container: "rgb(var(--color-surface-container) / <alpha-value>)",
              high: "rgb(var(--color-surface-high) / <alpha-value>)",
              highest: "rgb(var(--color-surface-highest) / <alpha-value>)",
              variant: "rgb(var(--color-surface-variant) / <alpha-value>)",
              tint: "rgb(var(--color-surface-tint) / <alpha-value>)",
            },
            // On-surface text roles
            "on-surface": {
              DEFAULT: "rgb(var(--color-on-surface) / <alpha-value>)",
              variant: "rgb(var(--color-on-surface-variant) / <alpha-value>)",
              inverse: "rgb(var(--color-on-surface-inverse) / <alpha-value>)",
            },
            // Borders / outlines
            outline: {
              DEFAULT: "rgb(var(--color-outline) / <alpha-value>)",
              variant: "rgb(var(--color-outline-variant) / <alpha-value>)",
            },
            // Secondary — muted charcoal
            secondary: {
              DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
              foreground: "rgb(var(--color-secondary-foreground) / <alpha-value>)",
              container: "rgb(var(--color-secondary-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-secondary-on-container) / <alpha-value>)",
              fixed: "rgb(var(--color-secondary-fixed) / <alpha-value>)",
              "fixed-dim": "rgb(var(--color-secondary-fixed-dim) / <alpha-value>)",
              "on-fixed": "rgb(var(--color-secondary-on-fixed) / <alpha-value>)",
              "on-fixed-variant": "rgb(var(--color-secondary-on-fixed-variant) / <alpha-value>)",
            },
            // Tertiary
            tertiary: {
              DEFAULT: "rgb(var(--color-tertiary) / <alpha-value>)",
              foreground: "rgb(var(--color-tertiary-foreground) / <alpha-value>)",
              container: "rgb(var(--color-tertiary-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-tertiary-on-container) / <alpha-value>)",
              fixed: "rgb(var(--color-tertiary-fixed) / <alpha-value>)",
              "fixed-dim": "rgb(var(--color-tertiary-fixed-dim) / <alpha-value>)",
              "on-fixed": "rgb(var(--color-tertiary-on-fixed) / <alpha-value>)",
              "on-fixed-variant": "rgb(var(--color-tertiary-on-fixed-variant) / <alpha-value>)",
            },
            // Success — completed, verified, low-risk states
            success: {
              DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
              foreground: "rgb(var(--color-success-foreground) / <alpha-value>)",
              container: "rgb(var(--color-success-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-success-on-container) / <alpha-value>)",
            },
            // Caution — in-progress, pending, medium-risk states
            caution: {
              DEFAULT: "rgb(var(--color-caution) / <alpha-value>)",
              foreground: "rgb(var(--color-caution-foreground) / <alpha-value>)",
              container: "rgb(var(--color-caution-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-caution-on-container) / <alpha-value>)",
            },
            // Info — confirmatory states, under-review status
            info: {
              DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
              foreground: "rgb(var(--color-info-foreground) / <alpha-value>)",
              container: "rgb(var(--color-info-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-info-on-container) / <alpha-value>)",
            },
            // Semantic — system errors (unrecoverable, destructive)
            error: {
              DEFAULT: "rgb(var(--color-error) / <alpha-value>)",
              foreground: "rgb(var(--color-error-foreground) / <alpha-value>)",
              container: "rgb(var(--color-error-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-error-on-container) / <alpha-value>)",
            },
            // Warning — urgency, approaching deadlines, compliance reminders
            warning: {
              DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
              foreground: "rgb(var(--color-warning-foreground) / <alpha-value>)",
              container: "rgb(var(--color-warning-container) / <alpha-value>)",
              "on-container": "rgb(var(--color-warning-on-container) / <alpha-value>)",
            },
            // Legacy aliases kept for existing code
            brand: {
              DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
              foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
            },
            corporate: {
              DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
              muted: "rgb(var(--color-secondary-container) / <alpha-value>)",
            },
            background: "rgb(var(--color-background) / <alpha-value>)",
            foreground: "rgb(var(--color-foreground) / <alpha-value>)",
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