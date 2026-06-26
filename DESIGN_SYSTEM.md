# BagStreet Admin — Design System

**Version**: 1.0
**Last updated**: 2026-06-26
**Applies to**: Admin dashboard (`/client`) only. Storefront has a separate design language.

---

## 1. Design Philosophy

The admin is a **control surface**, not a storefront. The rules are different:

- **Clarity over aesthetics** — data must be scannable before it is beautiful
- **Restraint signals premium** — one accent colour, used sparingly. Everything else recedes
- **Structure felt, not seen** — use spacing and weight hierarchy before reaching for borders or shadows
- **Earned colour** — colour communicates meaning (status, urgency, action), never decoration
- **Density is a feature** — the people who use this daily want more rows, not bigger cards

The admin should feel like it belongs to BagStreet, but it should not look like the storefront. The storefront is warm ivory, serif, romantic. The admin is cool neutral, sans-serif, precise.

---

## 2. Color System

All colours are defined as CSS custom properties in OKLch colour space. **Never hardcode hex values in components.** Always use semantic tokens.

### 2.1 Palette — Light Mode (Content Area)

```css
/* Base surfaces */
--color-bg-canvas:      oklch(0.975 0.003 240);   /* #f8fafc — cool white, not warm ivory */
--color-bg-surface:     oklch(1 0 0);              /* #ffffff — cards, sheets */
--color-bg-elevated:    oklch(1 0 0);              /* modals, dropdowns (add shadow) */
--color-bg-subtle:      oklch(0.965 0.004 240);   /* table alternates, disabled fields */
--color-bg-hover:       oklch(0.955 0.005 240);   /* row hover */

/* Text */
--color-text-primary:   oklch(0.16 0.015 250);    /* near-black with cool undertone */
--color-text-secondary: oklch(0.45 0.018 250);    /* labels, descriptions */
--color-text-tertiary:  oklch(0.62 0.012 250);    /* placeholders, meta */
--color-text-disabled:  oklch(0.72 0.008 250);    /* disabled elements */
--color-text-inverse:   oklch(0.98 0.002 250);    /* text on dark/accent backgrounds */

/* Borders */
--color-border-default: oklch(0.91 0.006 240);    /* card borders, input borders */
--color-border-subtle:  oklch(0.95 0.003 240);    /* table dividers, section dividers */
--color-border-strong:  oklch(0.78 0.012 240);    /* focused inputs, active states */

/* Brand accent (desaturated burgundy — works in data contexts) */
--color-accent:         oklch(0.42 0.12 14);       /* primary buttons, links, active nav */
--color-accent-hover:   oklch(0.36 0.13 14);       /* button hover */
--color-accent-subtle:  oklch(0.96 0.018 14);      /* accent-tinted backgrounds */
--color-accent-text:    oklch(0.98 0.003 30);      /* text on accent background */
```

### 2.2 Sidebar Palette (Dark Wine — already established, keep)

```css
--sidebar-bg:           oklch(0.18 0.028 15);      /* deep wine/near-black */
--sidebar-fg:           oklch(0.94 0.006 30);       /* off-white text */
--sidebar-fg-muted:     oklch(0.65 0.015 30);       /* inactive nav items */
--sidebar-item-active:  oklch(0.25 0.038 15);       /* active item background */
--sidebar-item-hover:   oklch(0.22 0.030 15);       /* hover background */
--sidebar-accent:       oklch(0.60 0.115 20);       /* active item text/icon */
--sidebar-border:       oklch(0.28 0.032 15);       /* sidebar/content divider */
```

### 2.3 Semantic Status Colours

These are the only colours allowed for status badges and indicators. Do not invent new ones.

```css
/* Success — confirmed, paid, in stock, active */
--color-success-bg:     oklch(0.94 0.06 145);      /* rgba(0,128,96,0.12) equivalent */
--color-success-text:   oklch(0.35 0.12 145);
--color-success-border: oklch(0.85 0.08 145);

/* Warning — pending, low stock, processing */
--color-warning-bg:     oklch(0.96 0.07 75);       /* amber-tinted */
--color-warning-text:   oklch(0.42 0.14 75);
--color-warning-border: oklch(0.86 0.10 75);

/* Danger — cancelled, failed, out of stock */
--color-danger-bg:      oklch(0.95 0.06 25);
--color-danger-text:    oklch(0.40 0.18 25);
--color-danger-border:  oklch(0.85 0.10 25);

/* Info — refunded, returned, shipped */
--color-info-bg:        oklch(0.95 0.04 240);
--color-info-text:      oklch(0.38 0.12 240);
--color-info-border:    oklch(0.84 0.07 240);

/* Neutral — draft, inactive, unknown */
--color-neutral-bg:     oklch(0.95 0.003 240);
--color-neutral-text:   oklch(0.45 0.01 240);
--color-neutral-border: oklch(0.84 0.005 240);
```

### 2.4 Status Mapping (BagStreet-specific)

| Status | Tone |
|---|---|
| PENDING | warning |
| CONFIRMED | info |
| PROCESSING | info |
| SHIPPED | info |
| DELIVERED | success |
| CANCELLED | danger |
| REFUNDED | neutral |
| PAID | success |
| UNPAID | warning |
| FAILED | danger |
| In stock | success |
| Low stock | warning |
| Out of stock | danger |

### 2.5 Chart Palette

Use the existing chart tokens. Order matters — use chart-1 for the primary series.

```
chart-1: oklch(0.38 0.148 14)   Burgundy      — primary metric
chart-2: oklch(0.60 0.115 20)   Rose          — secondary metric
chart-3: oklch(0.72 0.08 50)    Warm sand     — tertiary
chart-4: oklch(0.55 0.09 30)    Mauve         — quaternary
chart-5: oklch(0.82 0.065 80)   Champagne     — quinary
```

---

## 3. Typography

### 3.1 Font

**Admin uses Inter** — not the storefront's Cormorant/DM Sans stack. Inter was designed for data-dense UI and has the best tabular number support in its class.

```css
/* In index.css — add to @import or @font-face */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'; /* Inter optical improvements */
}
```

### 3.2 Type Scale

| Token | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `text-2xl` | 24px | 600 | 1.3 | Page titles (h1) |
| `text-xl` | 20px | 600 | 1.3 | Section headings (h2) |
| `text-lg` | 16px | 600 | 1.4 | Card titles, drawer titles |
| `text-base` | 14px | 400 | 1.5 | Body copy, descriptions |
| `text-sm` | 13px | 400 | 1.5 | **Table body** (primary) |
| `text-xs` | 12px | 500 | 1.4 | Table headers (uppercase), badges, labels |
| `text-2xs` | 11px | 400 | 1.4 | Meta, timestamps, footnotes |

### 3.3 Critical Rules

```css
/* Applied to all numeric columns — non-negotiable */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Table column headers */
.table-header {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

/* KPI values */
.kpi-value {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;  /* tight tracking on large numbers */
}
```

### 3.4 Column Alignment (non-negotiable)

| Content type | Alignment | Reasoning |
|---|---|---|
| Names, labels, text | Left | Natural reading direction |
| Prices, quantities, counts | **Right** | Column alignment for comparison |
| Dates (qualitative) | Left | — |
| Dates (comparative) | Right | — |
| Status badges | Left | — |
| Actions | Right | Consistent click target |
| **Column headers must match their column data** | — | Never centre a left-aligned column's header |

---

## 4. Spacing System

Based on a **4px grid**. Only use multiples of 4.

```
4px   — icon internal padding, badge horizontal padding
8px   — between tightly related elements (icon + label)
12px  — small component internal padding
16px  — card padding (compact), sidebar item padding
20px  — card padding (standard), between form fields
24px  — section gaps, card padding (comfortable)
32px  — between page sections
48px  — page header to first section
```

### Component Spacing Reference

```
Page padding:           px-6 py-6 (24px)
Card padding:           p-5 (20px) or p-6 (24px)
Table cell padding:     px-4 py-2.5 (compact) or px-4 py-3 (regular)
Form field gap:         gap-4 (16px)
Form section gap:       gap-6 (24px)
Sidebar item height:    h-9 (36px) — not h-10
Sidebar group gap:      mb-1 (4px) between items, mt-4 (16px) between groups
```

---

## 5. Elevation System

**Rule**: shadows communicate floating. Borders communicate grounded. Never use both on the same element.

| Layer | Style | Use |
|---|---|---|
| Canvas | no border, no shadow | Page background |
| Grounded card | `border border-border-default` | KPI cards, data tables, form sections |
| Floating element | `shadow-md` (`0 4px 12px rgba(0,0,0,0.08)`) | Dropdowns, command palette |
| Overlay | `shadow-xl` + `bg-black/40` backdrop | Modals, drawers |
| Tooltip | `shadow-sm` + `border` | Tooltips |

```css
/* Custom shadows to add to theme */
--shadow-card:    0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
--shadow-dropdown: 0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
--shadow-modal:   0 20px 60px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08);
```

---

## 6. Border Radius System

Purposeful variation — different radii for different component types:

```css
--radius-none:  0px     /* table rows, inline elements */
--radius-xs:    2px     /* badges, chips, small tags */
--radius-sm:    4px     /* buttons, inputs, small cards */
--radius-md:    6px     /* cards, panels */
--radius-lg:    8px     /* modals, drawers, sheets */
--radius-full:  9999px  /* avatar circles, toggle switches, pill badges */
```

**Mapping:**

| Component | Radius |
|---|---|
| Table rows | none |
| Status badges | xs (2px) |
| Buttons | sm (4px) |
| Inputs | sm (4px) |
| Cards | md (6px) |
| Dialogs/Modals | lg (8px) |
| Sheets/Drawers | lg (8px) on the leading edge, none on trailing |
| Avatars | full |
| Toggle switch | full |
| Notification badge | full |

---

## 7. Component Patterns

### 7.1 Data Tables

**Row density — implement three modes, persist to localStorage:**

| Mode | Row height | Padding | Font |
|---|---|---|---|
| Compact | 36px | `py-1.5 px-4` | 12px |
| Regular (default) | 44px | `py-2.5 px-4` | 13px |
| Relaxed | 52px | `py-3.5 px-4` | 14px |

**Anatomy of a well-designed table row:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ☐  │ #ORD1234  │ PENDING badge │ Amina Wanjiku │ KES 3,500 │ Jun 24  │ ··· │
│    │ mono/xs   │ status tone   │ 13px/400      │ right/tab │ left    │ row │
└─────────────────────────────────────────────────────────────────────────────┘
   ^        ^            ^              ^               ^           ^      ^
checkbox  id col    status badge    name col       amount col   date   actions
hidden    font-mono  4px radius     primary text    tabular-nums        hover only
on hover  text-xs                                   right-align
```

**Rules:**
- Checkbox column: 40px wide, hidden by default, visible on row hover and when any row is selected
- Selecting a row → bulk action bar slides in above or below the table toolbar
- Primary row action: click the row itself (opens detail sheet). NOT a View button
- Inline action buttons (edit, delete): appear on `group-hover`, 2 max. Tertiary actions go in `...` menu
- Empty state: centred, 200px height, icon + specific message + CTA button
- Skeleton: 8 rows of shimmer rectangles matching actual column widths
- Sticky header: always. `position: sticky; top: 0; z-index: 10; background: var(--color-bg-surface);`

**Table toolbar pattern:**

```
┌──────────────────────────────────────────────────────────────┐
│  [Search input]   [Status ▾]  [Date ▾]     [Export CSV]  [+] │
│                                            ← secondary  primary
└──────────────────────────────────────────────────────────────┘
```

- Search: 240px width, left-aligned, placeholder "Search orders..."
- Filters: compact selects (36px height) to the right of search
- Secondary actions (Export CSV): outline button, right side
- Primary action (Create): filled accent button, rightmost

### 7.2 KPI Cards

**Five required elements, nothing more:**

```
┌───────────────────────────────┐
│ Revenue          [TrendingUp] │  ← label (12px/500, uppercase) + icon (16px, muted)
│                               │
│ KES 284,500                   │  ← value (30px/700, tabular-nums)
│                               │
│ ▲ +12.4%  vs last month      │  ← delta + context (12px, success/danger colour)
│                               │
│ ▁▂▃▄▅▆▇█  (sparkline)        │  ← 7-day sparkline (60px × 28px, delta colour)
└───────────────────────────────┘
  border: 1px solid var(--color-border-default)
  border-radius: var(--radius-md)
  padding: 20px
  NO shadow
```

**Delta colour logic:**
```
Revenue up    → success (green)
Revenue down  → danger (red)
Refunds up    → danger (red — bad)
Orders up     → success (green)
Pending up    → warning (amber — monitor)
```

**Loading state:** skeleton only. Three grey rectangles (label, value, delta). No spinner.

### 7.3 Status Badges

```tsx
// Correct: semantic, specific, lowercase
<Badge variant="success">delivered</Badge>
<Badge variant="warning">pending</Badge>
<Badge variant="danger">cancelled</Badge>

// Wrong: generic, uppercase, overloaded
<Badge>ACTIVE</Badge>
```

**Badge anatomy:**
- Height: 20px
- Padding: 2px 8px
- Border-radius: 2px (xs) — square enough to read as "system status", not user tag
- Font: 11px / 500 / lowercase or sentence-case
- Subtle 1px ring: `box-shadow: 0 0 0 1px rgba(0,0,0,0.08)` keeps readability on coloured rows

### 7.4 Navigation Sidebar

**Sizing:**
- Expanded: 240px
- Collapsed: 56px (icon only)
- Item height: 36px (`h-9`)
- Icon size: 18px, stroke-width: 1.5 (not 2)
- Item padding: `px-3` when expanded, `px-0 justify-center` when collapsed

**Active state — filled background, not border stripe:**
```css
/* Active */
.nav-item-active {
  background: var(--sidebar-item-active);  /* oklch(0.25 0.038 15) */
  color: var(--sidebar-accent);            /* rose/lighter burgundy */
  /* icon: full opacity accent colour */
}

/* Inactive */
.nav-item-inactive {
  color: var(--sidebar-fg-muted);         /* 65% opacity off-white */
  /* icon: muted colour */
}

/* Hover */
.nav-item-hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-fg);               /* full opacity off-white */
}
```

**Never** change `font-weight` between active and inactive items — causes layout shift.

**Group labels:**
```css
.nav-group-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: oklch(0.45 0.012 30);  /* very muted */
  padding: 16px 12px 4px;
}
```

### 7.5 Dialogs vs Sheets

| Scenario | Component | Width | When |
|---|---|---|---|
| Destructive confirm (delete, cancel order) | Dialog | 400px | Action needs full attention |
| Short form 3–5 fields (invite user, add category) | Dialog | 480–520px | Self-contained, fast |
| Long form 6+ fields (create product) | Sheet | 560px | Needs context from list behind |
| Detail view (order detail, variant list) | Sheet | 520–600px | Reference while viewing list |
| Inline edit (single cell value) | Inline | — | Single field, low stakes |

**Dialog rules:**
- Overlay: `bg-black/40` (not `bg-black/80` — don't obliterate the page)
- Max height: 85vh with `overflow-y-auto`
- Footer: sticky at bottom inside the dialog, `border-t` separator
- Close on overlay click: yes for informational, no for destructive/long forms

**Sheet rules:**
- Slides from right, 560px wide
- Backdrop: `bg-black/20` — user can see the list behind
- Does NOT cover the sidebar — sits within the content area only
- Header: title + X button
- Footer sticky: Save + Cancel

### 7.6 Buttons

**Hierarchy:**
```
Primary   — filled accent bg, white text (one per section)
Secondary — outline (border + transparent bg, accent text)
Ghost     — no border, no bg (sidebar/table actions)
Destructive — filled red (delete, cancel — always in dialogs)
```

**Sizes:**
```
Default (h-9, 36px)  — toolbar buttons, form actions
sm (h-8, 32px)       — table row actions, badge-adjacent buttons
icon (h-9 w-9)       — icon-only buttons (must have tooltip)
```

**Loading state:**
```tsx
// Correct — width does not change, text is progressively worded
<Button disabled>
  <Spinner className="mr-2 h-4 w-4 animate-spin" />
  Saving...
</Button>

// Wrong — spinner replaces text (width jumps), or just "Loading..."
```

**Five required states:** default → hover → active → focus-visible → disabled

Disabled: `opacity-40 cursor-not-allowed` — not `opacity-50`, which reads as "broken"

### 7.7 Form Inputs

```css
/* Standard input */
height: 36px;                          /* h-9 — matches button height */
padding: 0 12px;                       /* px-3 */
border: 1px solid var(--color-border-default);
border-radius: var(--radius-sm);       /* 4px */
font-size: 14px;

/* Focus */
border-color: var(--color-border-strong);
box-shadow: 0 0 0 3px oklch(0.42 0.12 14 / 0.15);  /* accent focus ring */

/* Error */
border-color: var(--color-danger-text);
box-shadow: 0 0 0 3px oklch(0.40 0.18 25 / 0.15);
```

**Validation timing:** validate after the user has left a field AND returned, not on first blur.

**Error messages:** appear inline, below the field, 12px, danger colour. Not toasts.

**Field group ordering (product/order forms):**
```
1. Identity   — name, SKU, category
2. Pricing    — price, sale price, variants
3. Inventory  — stock, threshold, SKU
4. Media      — image upload
5. Settings   — is_active, is_featured, flags
```

---

## 8. State Patterns

### 8.1 Loading

| Context | Pattern |
|---|---|
| Initial page/table load | Skeleton (8 rows, shimmer) |
| Button action | Inline spinner + "Saving..." text |
| Route navigation | Top progress bar (2px, accent colour) |
| Chart loading | Skeleton rectangle matching chart dimensions |

**Never use a full-page spinner.**

Skeleton shimmer CSS:
```css
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-subtle) 25%,
    var(--color-bg-canvas) 50%,
    var(--color-bg-subtle) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-xs);
}
```

### 8.2 Empty States

**Four required elements:**
1. Icon (24px, muted, stroke-based — no cartoon illustrations)
2. Headline: specific. "No orders this week" not "Nothing to show"
3. One-sentence context: why it's empty
4. CTA button: creates or imports the first item

```
BagStreet-specific empty state copy:

Orders (no filter):  "No orders yet — share your store link on Instagram to get started"
Orders (filtered):   "No PENDING orders right now — all caught up!"
Products:            "Your catalogue is empty — add your first product to go live"
Low stock widget:    "All variants are well-stocked"
Variants:            "No variants yet — add sizes or colours to start tracking stock"
Promo codes:         "No codes created — run your first Instagram campaign"
```

### 8.3 Toast Notifications

- Position: bottom-right, 24px from edges
- Width: 340px
- Duration: 4s auto-dismiss (errors: manual dismiss only)
- Stack with 8px gap (newest on top)

**Copy patterns:**
```
✓ Success: "Product saved"  /  "Order confirmed"  /  "Stock updated"
✗ Error:   "Unable to save — {reason}"  /  "Connection failed, try again"
ⓘ Info:    "Export ready — your CSV is downloading"
```

**Never:** "Success!" / "Error!" / "Something went wrong"

### 8.4 Confirmation Dialogs (Destructive Actions)

```
Title:   Delete "Leather Tote Bag"?
Body:    This will permanently remove the product and all its variants.
         Orders that include this product will not be affected.
Actions: [Cancel]  [Delete product]  ← destructive button, right
```

For high-stakes actions (bulk delete, cancel paid order): require typing the entity name.

---

## 9. Interaction & Motion

**All durations use this scale:**

```css
--duration-instant:  0ms      /* no animation — checkbox state changes */
--duration-fast:     100ms    /* hover colour changes */
--duration-normal:   150ms    /* sidebar item transitions, button states */
--duration-moderate: 200ms    /* dropdown open/close */
--duration-slow:     300ms    /* sheet/modal enter/exit */
```

**Easing:**
```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);   /* default — most transitions */
--ease-out:    cubic-bezier(0, 0, 0.2, 1);      /* elements entering the screen */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);      /* elements leaving the screen */
```

**Card hover (interactive tiles only, not table rows):**
```css
transition: box-shadow 150ms ease, transform 150ms ease;
&:hover {
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}
&:active {
  transform: translateY(0);
}
```

**Table row hover:** background colour shift only — no translate, no shadow.

---

## 10. Implementation Checklist (CSS changes to `index.css`)

These tokens need to be added to the `:root` block:

```css
:root {
  /* Surfaces */
  --color-bg-canvas:      oklch(0.975 0.003 240);
  --color-bg-hover:       oklch(0.955 0.005 240);

  /* Status semantic colours */
  --color-success-bg:     oklch(0.94 0.06 145);
  --color-success-text:   oklch(0.35 0.12 145);
  --color-warning-bg:     oklch(0.96 0.07 75);
  --color-warning-text:   oklch(0.42 0.14 75);
  --color-danger-bg:      oklch(0.95 0.06 25);
  --color-danger-text:    oklch(0.40 0.18 25);
  --color-info-bg:        oklch(0.95 0.04 240);
  --color-info-text:      oklch(0.38 0.12 240);
  --color-neutral-bg:     oklch(0.95 0.003 240);
  --color-neutral-text:   oklch(0.45 0.01 240);

  /* Radius scale */
  --radius-none: 0px;
  --radius-xs:   2px;
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-card:    0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-dropdown: 0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
  --shadow-modal:   0 20px 60px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08);

  /* Motion */
  --duration-fast:     100ms;
  --duration-normal:   150ms;
  --duration-moderate: 200ms;
  --duration-slow:     300ms;
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out:    cubic-bezier(0, 0, 0.2, 1);
}
```

**Component changes required (overhaul order):**

| Priority | Component | Key changes |
|---|---|---|
| 1 | `index.css` | Add tokens above, switch body font to Inter, add shimmer keyframes |
| 2 | `badge.tsx` | Add success/warning/danger/info/neutral variants using semantic tokens |
| 3 | `DashboardLayout.tsx` | Content bg → `bg-canvas`, sidebar spacing, icon stroke-width 1.5 |
| 4 | `table.tsx` | Sticky header, tabular-nums utility, hover bg using `bg-hover` |
| 5 | Dashboard KPI cards | Sparklines, delta indicators, remove shadows, add border |
| 6 | `button.tsx` | Disabled opacity-40, loading state pattern |
| 7 | All data tables | Column alignment, header style (uppercase 11px), empty states |
| 8 | All dialogs/sheets | Overlay opacity, sizing, footer sticky |
| 9 | Form inputs | h-9, focus ring, error state |

---

## 11. Figma Reference Files

The following files were provided as inspiration sources:

- `Dashboard UI.fig` — reference for layout patterns and component density
- `Software colors.fig` — colour palette approach and semantic colour mapping
- `Dashboard Flaws.fig` — anti-patterns to avoid (common mistakes annotated)
- `Design 2025.fig` — current design trends reference

Key takeaways that align with this system:
- Cool neutral canvas (not warm) for data-heavy admin surfaces
- Dark sidebar as a persistent anchor
- Status colours as the primary colour vehicle (everything else neutral)
- Compact table rows by default with density toggle
- Borders (not shadows) on grounded cards
