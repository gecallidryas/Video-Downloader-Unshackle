---
name: Precision Panel
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424656'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#a33200'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  heading-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  body-compact:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-xs:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
  data-mono:
    fontFamily: monospace
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  panel-padding: 12px
  stack-gap: 8px
  item-gap: 4px
  inline-gap: 6px
  touch-target-min: 28px
---

## Brand & Style

This design system is built for high-utility browser extension environments where screen real estate is at a premium. The brand personality is clinical, efficient, and unobtrusive. It targets power users and professionals who require immediate access to tools without visual distraction. 

The design style is **Minimalism** with a heavy focus on functional density. It avoids the "fluff" of modern consumer web design—such as oversized margins and soft shadows—in favor of a flat, rigorous interface. The UI should evoke a sense of professional-grade reliability, feeling like an integrated part of the browser's native developer tools or sidebar rather than a third-party overlay.

## Colors

The palette is rooted in a "Greyscale-Plus" philosophy. The majority of the interface utilizes a sophisticated range of cool grays to define structure and hierarchy without competing for attention.

- **Primary Action:** A vibrant Electric Blue (#0066FF) is reserved exclusively for the most critical user intent, such as "Download" or "Submit."
- **Success/Secondary:** A crisp Emerald (#10B981) provides feedback for completed states.
- **Surface Strategy:** We use a white background for the primary content area and a subtle off-white (`#F8FAFC`) for headers or inactive side-rails to create logical grouping without adding visual weight.
- **Borders:** Instead of shadows, we use a single-pixel hairline border (`#E2E8F0`) to separate elements.

## Typography

This design system utilizes **Inter** for its exceptional legibility at small scales and neutral, systematic character. To maximize information density within the side panel, we skip traditional large headers.

- **Navigation & Section Headers:** Use `heading-caps` in all-caps with slight letter spacing to create clear anchors without using large font sizes.
- **Main Interaction:** `body-compact` handles the bulk of user information.
- **Micro-labels:** `label-xs` is used for timestamps, file sizes, or secondary metadata.
- **Monospaced Data:** For IDs, paths, or technical strings, a standard monospace font is used to ensure character-level clarity.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for a narrow viewport (typically 300px–400px). Because the horizontal space is limited, the design system prioritizes vertical stacking with tight, rhythmic spacing.

- **Container:** A 12px outer padding ensures content doesn't feel cramped against the browser frame.
- **Rhythm:** An 8px stack gap separates distinct functional groups, while a 4px item gap is used for elements within a group (like list items).
- **Density:** Components are designed with a 28px minimum height—smaller than standard mobile targets but ideal for precise mouse interaction in a browser sidebar.

## Elevation & Depth

This design system rejects depth-based metaphors. It is **strictly flat**. 

- **Hierarchy through Contrast:** Elevation is communicated via background color shifts rather than shadows. An active item might use a light blue tint or a 1px border, while an inactive item remains flush with the background.
- **Low-Contrast Outlines:** Use subtle, 1px solid borders (`#E2E8F0`) to define cards or input fields. 
- **Dividers:** Horizontal rules are used sparingly, only when a change in content type occurs. Use `background-subtle` fills for container headers to create a "stacked sheet" effect without physical shadows.

## Shapes

To maintain a professional and efficient aesthetic, the design system uses **Soft (Level 1)** roundedness. 

- **Radius:** A standard 4px (`0.25rem`) radius is applied to buttons, input fields, and checkboxes. 
- **Logic:** This subtle rounding prevents the UI from feeling "sharp" or "aggressive" (Brutalist) while remaining much more space-efficient and serious than pill-shaped or highly rounded "consumer" interfaces. Large components like cards should not exceed 8px (`0.5rem`) radius.

## Components

- **Buttons:** 
    - *Primary:* Solid Electric Blue with white text. No gradient, no shadow. 
    - *Secondary/Ghost:* Transparent background with a 1px slate border.
- **Lists:** High-density rows with a hover state background of `#F8FAFC`. Each row has a 4px vertical padding.
- **Inputs:** Flat white backgrounds with a 1px slate border. On focus, the border changes to the primary accent color with no glow effect.
- **Chips/Tags:** Small, rectangular with a 2px radius. Use light gray backgrounds with dark gray text for status; use primary blue only for active filters.
- **Checkboxes:** Square with a 2px radius. When checked, they fill with the primary color and a white checkmark.
- **Progress Bars:** Thin 4px height bars. The background is a light gray track, and the fill is the vibrant primary accent.
- **Action Icons:** Use 16px glyphs. Icons should be functional (e.g., "Trash," "Download," "Settings") and avoid decorative-only imagery.