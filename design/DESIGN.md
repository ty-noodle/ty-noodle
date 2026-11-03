# Design System Document: The Executive Insight

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Editor"**
This design system moves away from the "widget-heavy" aesthetic of traditional dashboards toward a high-end editorial experience. Instead of a rigid grid of boxes, we treat sales data as a curated narrative. We achieve this through **Intentional Asymmetry**—where large data visualizations are balanced by generous whitespace—and **Tonal Depth**, using layers of blue and white rather than lines to define structure. 

The goal is a "Quiet Authority": a workspace that feels official and stable, yet possesses the fluid responsiveness of a modern digital flagship. We break the "template" look by overlapping elements slightly and using extreme typographic contrast to guide the eye.

## 2. Colors & Surface Architecture
The palette is rooted in a deep, professional navy hierarchy, utilizing shifts in luminance rather than structural lines to organize information.

*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background shifts. For instance, a KPI section should use `surface-container-low` to sit naturally against the `surface` background.
*   **Surface Hierarchy & Nesting:** Treat the UI as a series of physical layers. 
    *   **Level 0 (Base):** `surface` (#fbf8ff) for the main canvas.
    *   **Level 1 (Sections):** `surface-container-low` (#f5f2fb) for sidebar or secondary navigation.
    *   **Level 2 (Active Cards):** `surface-container-lowest` (#ffffff) for primary data modules to create a "lifted" feel.
*   **The "Glass & Gradient" Rule:** Floating action menus or header overlays should utilize glassmorphism. Use `surface_container_low` at 80% opacity with a `backdrop-filter: blur(12px)`.
*   **Signature Textures:** Main CTA buttons and "Hero" trend lines should utilize a subtle linear gradient from `primary` (#000666) to `primary_container` (#1a237e) at a 135-degree angle to add a dimension of polished depth.

## 3. Typography
We utilize **Inter** to bridge the gap between technical precision and modern elegance.

*   **Display (The Hook):** Use `display-md` for primary revenue totals. This high-contrast scale provides the "editorial" feel, making the data feel like a headline rather than a value.
*   **Headlines & Titles:** `headline-sm` is reserved for section headers (e.g., "Quarterly Performance"). Use `title-md` for card titles, always in `on_surface` to maintain authority.
*   **Labels & Body:** `label-md` should be used for axis labels and metadata, often in `on_surface_variant` (#454652) to recede visually, ensuring the data remains the hero.
*   **Intentional Weight:** Use `Medium` (500) weights for numbers and `Regular` (400) for descriptive text to create a clear scan-path.

## 4. Elevation & Depth
Depth is a functional tool, not a decoration. We use **Tonal Layering** to convey importance.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. This creates a soft, natural "pop" without the visual noise of a shadow.
*   **Ambient Shadows:** For floating elements (Modals/Popovers), use a multi-layered shadow:
    *   `box-shadow: 0 4px 20px rgba(27, 27, 33, 0.04), 0 12px 40px rgba(27, 27, 33, 0.08);`
    *   The shadow is tinted with `on_surface` to mimic natural light in a professional environment.
*   **The "Ghost Border" Fallback:** If a container requires definition against a white background, use the `outline_variant` token at **15% opacity**. Never use 100% opaque borders.

## 5. Components

### Buttons
*   **Primary:** `primary` background with `on_primary` text. Use `xl` (1.5rem) roundedness for a modern feel. Hover state: Shift to `primary_container`.
*   **Secondary:** `secondary_fixed_dim` with `on_secondary_fixed`. No border.
*   **Tertiary:** Ghost style. `on_surface` text with a `surface_container_high` background appearing only on hover.

### Cards & Data Lists
*   **The Rule of Flow:** Forbid the use of divider lines between list items. Use **Spacing 4** (1.4rem) to separate rows, or subtle alternating backgrounds using `surface_container_low` and `surface_container_lowest`.
*   **Roundedness:** All cards must use `lg` (1rem / 16px) corner radius to soften the "official" tone and make it feel approachable.

### Input Fields
*   **Style:** Minimalist. Use `surface_container_highest` as a subtle fill rather than an outlined box. 
*   **Focus State:** A 2px signature glow using `secondary` at 30% opacity.

### Dashboard Specific Components
*   **Metric Strips:** Horizontal arrays of data using `display-sm` for the value and `label-md` for the trend indicator (using `error` or `secondary` for status).
*   **The Glass Header:** A sticky top navigation using the Glassmorphism rule to maintain a sense of space while scrolling.

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical margins (e.g., more padding on the left than the right in a hero section) to create an editorial layout.
*   **Do** use `secondary_container` for non-critical accents to keep the "Professional Navy" theme varied.
*   **Do** utilize the full Spacing Scale; "Plenty of whitespace" means at least `Spacing 10` (3.5rem) between major dashboard modules.

### Don't:
*   **Don't** use pure black (#000000) for text. Always use `on_surface` (#1b1b21) to maintain the premium navy-ink feel.
*   **Don't** use standard "Drop Shadows" from software defaults. Always use the Ambient Shadow formula.
*   **Don't** crowd the screen. If a dashboard has more than 5 primary modules, move secondary data to a "Deep Dive" layer using `surface-container-high` nesting.