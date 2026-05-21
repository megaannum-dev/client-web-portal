---
name: Premium FinTech CRM
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#584236'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#8b7264'
  outline-variant: '#dfc0b0'
  surface-tint: '#994700'
  primary: '#f27405'
  on-primary: '#ffffff'
  primary-container: '#f27405'
  on-primary-container: '#522300'
  inverse-primary: '#ffb68b'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfdf'
  on-secondary-container: '#636262'
  tertiary: '#585f6c'
  on-tertiary: '#ffffff'
  tertiary-container: '#9198a6'
  on-tertiary-container: '#29303c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbc8'
  primary-fixed-dim: '#ffb68b'
  on-primary-fixed: '#321200'
  on-primary-fixed-variant: '#753400'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1c1b1c'
  on-secondary-fixed-variant: '#474647'
  tertiary-fixed: '#dce3f2'
  tertiary-fixed-dim: '#c0c7d6'
  on-tertiary-fixed: '#151c27'
  on-tertiary-fixed-variant: '#404753'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-xs: 4px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style

The visual identity of this design system is rooted in the "Premium FinTech" aesthetic—a blend of institutional reliability and modern digital efficiency. The brand personality is authoritative yet accessible, designed to evoke a sense of security and precision necessary for high-stakes financial relationship management.

The design style follows a **Modern Corporate** approach with a heavy emphasis on **Minimalism**. We prioritize function over decoration, utilizing generous whitespace to reduce cognitive load and crisp, subtle borders to define structure without cluttering the interface. The interface should feel like a high-end tool: sharp, responsive, and meticulously organized.

## Colors

The color palette is strategically balanced to drive action while maintaining a professional backdrop. 

- **Primary (Vibrant Orange):** Reserved strictly for primary Call-to-Actions (CTAs), critical alerts, and active states. It provides a high-contrast focal point against the neutral background.
- **Secondary (Deep Charcoal/Slate):** Used for sidebars, primary navigation, and headers to anchor the UI with an institutional weight.
- **Neutrals:** A range of light greys and off-whites are used to create "zonal" depth. The primary background is nearly white to ensure the interface feels airy and commercial.
- **Semantic Colors:** Success, Error, and Warning colors should be used sparingly, ensuring they do not compete with the primary orange accent.

## Typography

This design system utilizes **Hanken Grotesk** for all typographic layers. This font was selected for its contemporary geometry and exceptional legibility at small sizes, which is critical for data-heavy CRM environments.

The hierarchy is established through weight and purposeful shifts in scale. Headlines use a tighter letter-spacing and heavier weights to command attention, while body text maintains a generous line height to ensure readability during extended periods of use. Labels are occasionally transformed to uppercase with slight tracking to differentiate metadata from primary content.

## Layout & Spacing

The layout operates on a **Fixed Grid** system for desktop to maintain a high-end, editorial feel, transitioning to a fluid model for tablet and mobile devices. 

- **Desktop (1280px+):** A 12-column grid with 24px gutters and 32px side margins. Content is often centered in a max-width container to prevent line-lengths from becoming unreadable on ultra-wide monitors.
- **Tablet (768px - 1279px):** 8-column grid with 20px gutters. Sidebars may collapse into icons-only or drawer menus.
- **Mobile (Under 767px):** 4-column fluid grid. Padding is reduced to 16px to maximize screen real estate.

Spacing follows an 8px linear scale. Large amounts of whitespace are used between major sections (stack-lg) to clearly separate distinct functional areas like "Client Overview" and "Transaction History."

## Elevation & Depth

To maintain a minimalistic and "flat" institutional look, this design system avoids heavy drop shadows. Depth is instead communicated through **Tonal Layers** and **Low-Contrast Outlines**.

- **Surface Levels:** The base background is the lowest level. Cards and "containers" sit on top of this background with a pure white surface and a 1px border (#E5E7EB).
- **Interactive States:** When an element is hovered or active, a very soft, highly diffused ambient shadow may be applied (e.g., 0px 4px 12px rgba(0,0,0,0.05)) to suggest "lift" without breaking the clean aesthetic.
- **Overlays:** Modals and dropdowns utilize a slightly more pronounced shadow and a subtle backdrop blur to focus the user's attention while maintaining the context of the CRM dashboard behind them.

## Shapes

The shape language is **Rounded (0.5rem)**. This increased corner radius provides a more modern, approachable feel while maintaining professional structure, softening the "sharp" institutional look of traditional finance.

- **Standard Elements:** Buttons, input fields, and tags use an 8px (0.5rem) radius.
- **Containers:** Larger cards and dashboard widgets use a 16px (1rem) radius to clearly define major content modules.
- **Icons:** Should follow a consistent stroke weight (typically 1.5px or 2px) with rounded terminals to match the component language.

## Components

### Buttons
- **Primary:** Solid Vibrant Orange background with White text. No border.
- **Secondary:** White background with 1px Slate Grey border and Slate Grey text.
- **Ghost:** Transparent background with Slate Grey text; used for low-priority actions.

### Input Fields
- Inputs feature a 1px light grey border that shifts to Slate Grey on focus. 
- Error states utilize a red border and a small supporting text label below the field. 
- Placeholder text should be high-contrast enough to be legible but distinct from user-entered data.

### Data Tables (CRM Specific)
- Tables are the heart of the CRM. Use subtle horizontal dividers only; avoid vertical lines to keep the look clean.
- Header rows use the secondary color (Slate Grey) or a light grey background with bold labels for clear categorization.

### Cards & Widgets
- White background with a subtle border. 
- Headers within cards should use `headline-md` or `headline-sm` to provide clear section entry points.

### Chips & Status Indicators
- Statuses (e.g., "Active," "Pending," "Closed") should use low-saturation background tints of their respective semantic colors with high-saturation text to maintain readability without overwhelming the dashboard.