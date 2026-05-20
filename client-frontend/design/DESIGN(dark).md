---
name: Megaannum CRM
colors:
  surface: '#111415'
  surface-dim: '#111415'
  surface-bright: '#373a3b'
  surface-container-lowest: '#0c0f10'
  surface-container-low: '#191c1d'
  surface-container: '#1d2021'
  surface-container-high: '#282a2b'
  surface-container-highest: '#323536'
  on-surface: '#e1e3e4'
  on-surface-variant: '#dfc0b2'
  inverse-surface: '#e1e3e4'
  inverse-on-surface: '#2e3132'
  outline: '#a78b7e'
  outline-variant: '#584237'
  surface-tint: '#ffb691'
  primary: '#ffb691'
  on-primary: '#552100'
  primary-container: '#f37321'
  on-primary-container: '#552100'
  inverse-primary: '#9e4300'
  secondary: '#c8c6c6'
  on-secondary: '#303030'
  secondary-container: '#474747'
  on-secondary-container: '#b6b5b4'
  tertiary: '#c7c6c6'
  on-tertiary: '#303031'
  tertiary-container: '#989898'
  on-tertiary-container: '#303031'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbcb'
  primary-fixed-dim: '#ffb691'
  on-primary-fixed: '#341100'
  on-primary-fixed-variant: '#783100'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#e3e2e2'
  tertiary-fixed-dim: '#c7c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#464747'
  background: '#111415'
  on-background: '#e1e3e4'
  surface-variant: '#323536'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max-width: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-tablet: 24px
  margin-mobile: 16px
---

## Brand & Style
The design system for Megaannum CRM is built on the pillars of **Precision, Authority, and Velocity**. As a modern enterprise CRM, it bridges the gap between traditional reliability and contemporary efficiency. The aesthetic is a blend of **Corporate Modern** and **Minimalism**, stripping away superfluous ornamentation to focus on data density and actionable insights within a high-performance **Dark Mode** environment.

The visual language communicates high trust through a stable, structured layout. In this dark configuration, the vibrant action color provides an even more energetic pulse that drives user workflow against the deep, focused background. This design system avoids the "playfulness" of consumer apps in favor of a sophisticated, commercial environment that feels both expensive and utilitarian.

## Colors
The color palette is derived directly from the core brand identity and optimized for a **Dark Mode** experience. **Primary Orange (#f37321)** is reserved strictly for interactive elements, calls to action, and critical progress indicators. This ensures that in a data-heavy dark environment, the "next step" is always visually striking and intuitive.

The structural foundation utilizes a scale of **Charcoal and Muted Greys**. Deep surfaces reduce eye strain during long working sessions, while mid-tone greys (#828282) provide subtle borders that define the information architecture without creating visual clutter. The use of #373737 for secondary containers provides a grounded, authoritative frame for the CRM's high-density data.

## Typography
This design system employs **Manrope** as its sole typeface. Chosen for its geometric modernism and exceptional legibility in data-dense tables, it provides the refined, technical look necessary for a CRM. 

The typographic hierarchy prioritizes scanning. Headlines use a semi-bold weight and tighter letter spacing to feel impactful and "locked in." In this dark theme, body text utilizes light grey and white tones to ensure that long-form customer notes and activity logs remain highly readable against the dark background. Labels are frequently used in uppercase with slight tracking to differentiate metadata from primary content.

## Layout & Spacing
The layout philosophy follows a **Fixed-Fluid Hybrid** model. The main content area sits within a 1440px container for desktop to prevent line lengths from becoming unreadable, while the sidebars remain fixed. A strict **8px grid system** governs all padding and margins, ensuring mathematical harmony across the UI.

In this design system, "Generous Spacing" is a functional tool. White space (or "dark space") is used to group related customer information without the need for heavy boxes. 
- **Desktop:** 12-column grid, 24px gutters, 40px external margins.
- **Tablet:** 8-column grid, 16px gutters, 24px external margins.
- **Mobile:** 4-column grid, 16px gutters, 16px external margins.

## Elevation & Depth
To maintain a minimalistic and high-trust professional aesthetic, this design system avoids heavy shadows. Instead, it utilizes **Tonal Layering and Low-Contrast Outlines** designed for dark interfaces.

Depth is created by stacking progressively lighter surfaces:
1.  **Background:** The lowest layer, a deep neutral dark tone.
2.  **Cards/Modules:** Slightly lighter surfaces with a subtle 1px border (#373737) to distinguish containers from the background.
3.  **Active/Floating Elements:** Modals and dropdowns use a subtle tonal lift and a 1px outline to feel light but distinct against the dark canvas, maintaining a clean, professional hierarchy.

## Shapes
The shape language is **Structured and Professional**. An 8px base radius (Level 2) is applied to buttons, input fields, and small UI components. This moderate rounding provides a clean, modern feel that softens the analytical nature of enterprise-grade software without feeling overly casual or "bubbly."

Larger containers like cards or dashboard widgets use a 16px radius (rounded-lg) to create a clear but disciplined containment. This consistent geometric approach uses subtle curves to balance the rigid data structures inherent in a CRM, maintaining a serious, commercial aesthetic.

## Components
### Buttons
- **Primary:** Solid Orange (#f37321) with White text. No gradients.
- **Secondary:** Transparent background with a 1px Grey border and Light Grey text.
- **Tertiary:** Pure text-link style using the Primary Orange for high visibility within data rows.

### Input Fields
Inputs are minimal: a 1px grey border that transitions to Primary Orange on focus. In dark mode, inputs use a slightly recessed tonal fill. Labels always sit above the field in the "label-md" style. Error states utilize a crisp red border with a supporting sub-text icon.

### Cards & Modules
All data is housed in cards. Cards use a tonal surface slightly lighter than the background and are defined by 1px borders. Header sections of cards are separated by a subtle horizontal rule.

### Data Tables
Tables are the heart of the design system. They feature 0px borders between columns but 1px dividers between rows. High-contrast white/light-grey text is used for primary data points, while muted grey is used for secondary data.

### Chips & Badges
Used for status indicators (e.g., "Qualified," "Negotiation"). These use a desaturated version of the status color with a darker text overlay or high-contrast borders to ensure they don't compete with primary action buttons in the dark UI.