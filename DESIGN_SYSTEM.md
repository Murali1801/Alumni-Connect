# AlumniLink — Design System (LinkedIn Theme)

**Status:** binding. This file overrides any default styling instinct. Do not substitute your own palette, typefaces, radii, or shadows.
**Companion:** `ANTIGRAVITY_BUILD_PROMPT.md` — functional spec.

> **Note on the brief:** The user explicitly requested to migrate the aesthetic to a **LinkedIn-based theme** across the entire site. This means adopting LinkedIn's specific shade of blue (`#0a66c2`), their native OS font stack, and their standard gray-and-white card-based visual hierarchy.

---

## 1. The thesis

Every design decision here serves one idea:

> **Familiarity and Professionalism.**

Users immediately associate this visual language with professional networking. 

---

## 2. Tokens

These are defined in `app/globals.css` under `@theme`. Use only these values.

### Colour

```css
@theme {
  /* Surfaces */
  --color-paper:      #f3f2ef; /* LinkedIn warm gray background */
  --color-surface:    #ffffff; /* White cards */
  --color-surface-2:  #e9e5df; /* Hover states, inset areas */

  /* Text */
  --color-ink:        rgba(0,0,0,0.9); /* Primary text */
  --color-ink-2:      rgba(0,0,0,0.6); /* Secondary text */
  --color-ink-3:      rgba(0,0,0,0.45); /* Tertiary, meta */

  /* State */
  --color-live:       #0a66c2; /* LinkedIn Blue — primary action */
  --color-live-tint:  #e9f5ff; /* Blue wash — success bg */
  --color-dormant:    #9AA5B1; /* Unclaimed state */
  --color-pending:    #A65A00; /* Awaiting T&P verification */
  --color-pending-tint:#FBF0E2;
  --color-score:      #0a66c2; /* Linked blue for highlights */
  --color-danger:     #cc1016; /* LinkedIn Red — destructive */

  /* Structure */
  --color-line:       rgba(0,0,0,0.08); /* 1px hairlines */
  --color-line-2:     rgba(0,0,0,0.15); /* Emphasised dividers */
}
```

### Type

The platform uses native system fonts to match LinkedIn's OS-native approach:

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

### Space, radius, elevation

```
Radius:  --radius-sm 4px · --radius 8px · --radius-lg 12px · --radius-full 9999px
```

**Elevation is severely limited.** 
- `--shadow-card`: `0 0 0 1px rgba(0,0,0,0.08)` (LinkedIn flat card stroke)
- `--shadow-float`: `0 4px 12px rgba(0,0,0,0.15)` (Dropdown shadow)

## 3. UI Patterns

- **Cards:** White background (`bg-surface`), `rounded` (8px radius), and `shadow-card`.
- **Buttons:** Primary buttons use `bg-live` (LinkedIn blue) and `text-white`. Outline buttons use `border-line-2` and `text-ink-2`.
- **Navigation:** Top navigation bars should typically have a white background (`bg-surface`) with a bottom border (`border-line`), mirroring LinkedIn's modern UI.
