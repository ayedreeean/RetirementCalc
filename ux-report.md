# FIRECalc UX Audit Report — Feb 2026

## What Was Fixed

### Accessibility
- **Skip-to-content link** — Hidden until focused via keyboard, jumps to main content
- **ARIA roles** — Added `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls` to navigation tabs
- **`aria-label`** on help button (was just "?")
- **`aria-hidden="true"`** on decorative emoji icons
- **Semantic `<main>` and `<nav>`** elements wrapping content and tab navigation
- **`:focus-visible`** styles — 3px primary-light outline for keyboard users, no outline for mouse clicks

### Mobile Responsiveness
- **Input grids collapse to single column** on screens ≤640px via `!important` override on inline `grid-template-columns` styles
- **Milestones grid** collapses to 1-column on <375px, 2-column on <480px
- **Summary grid** collapses to 1-column on <375px
- **Modal dialogs** — capped at 85dvh with overflow-y scroll; on <480px uses 96% width and 92dvh
- **Font sizes reduced** appropriately at <375px breakpoint
- **Chart canvas** gets `max-width: 100%` to prevent horizontal overflow
- **Touch targets** — minimum 44px height on nav links, filter buttons, view-details buttons on mobile
- **Help button** enlarged to 56px on mobile for thumb reach

### Visual Polish
- **Tab switching animation** — 250ms fade-in with slight upward slide
- **Input error state** — `.input-error` class adds red border + red focus ring; `.input-error-text` for error messages (ready for JS to apply)
- **Loading shimmer** on simulation button — add `.loading` class to show animated shimmer effect
- **Consistent `-webkit-overflow-scrolling: touch`** on all scrollable containers
- **Help modal sections** styled with colored headings and border separators for scannability

### Information Architecture
- **Help section** headings now have visual hierarchy with colored borders
- **Filter buttons** are more compact on mobile to fit in one row

## What Was NOT Changed (Recommendations for Future)

### Requires `app.js` Changes
1. **Keyboard navigation between tabs** (Left/Right arrow keys) — needs JS event handler
2. **Focus trap in modals** — needs JS to trap Tab key within open modal
3. **Apply `.input-error` class** on validation failure — needs JS integration
4. **Apply `.loading` class** to simulation button during execution — needs JS
5. **Collapsible simulation details table** — would need JS toggle; currently just uses max-height scroll

### Design Recommendations
1. **Dark theme** — The brief mentioned "dark theme" but the app is actually light-themed. No changes made to preserve existing identity.
2. **Simulation table on mobile** could benefit from a card-based layout instead of horizontal scroll
3. **Milestone cards** are useful but could show a progress bar to make the visual more engaging
4. **Color contrast** — Current indigo-on-white passes WCAG AA. The primary gradient text on the primary-card uses white which is fine. Neutral text (#64748b) on white background has 4.7:1 ratio — passes AA for normal text.
5. **Chart color palette** — Currently managed by Chart.js in app.js; recommend defining a consistent palette in CSS custom properties
6. **The inline `style` attributes** on many elements (especially `display: grid; grid-template-columns: ...`) should be moved to CSS classes for cleaner maintenance

## Files Modified
- `index.html` — Added skip-to-content link, ARIA roles/attributes, semantic elements
- `styles.css` — Appended ~150 lines of UX improvements at bottom of file
- `ux-report.md` — This file
