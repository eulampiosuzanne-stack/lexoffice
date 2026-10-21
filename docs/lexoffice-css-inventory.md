# Visual architecture inventory (2026-10-20)

## Confirmed sources
- `src/main.tsx` imports a long sequence of global CSS, including
  `lexoffice-final-system.css`, `lexoffice-luxe.css`,
  `lexoffice-uniform.css`, `lexoffice-light-theme.css`,
  and `lexoffice-2-shell.css`.
- `src/pages/Service.tsx` previously injected a large `const css` string
  plus `service-2.css?raw` directly into the DOM.
- Legacy styles share `.service-*` selectors with the new Inbox and
  contain competing `!important` rules.
- `ThemeController.tsx` stores the theme in `lexoffice-theme` and sets
  `html[data-lex-theme]`.

## Dependency / retirement decisions
| Source | Decision | Reason |
|---|---|---|
| Service inline `const css` | Remove | Duplicate component-local legacy rules |
| `service-2.css` | Retire from imports | Previous override stack |
| `service-workspace.css` | New single owner | Inbox layout, messages, details, bulk modal |
| `design-system/tokens.css` | Add | Shared theme values |
| `design-system/components.css` | Add | Opt-in shared controls |
| Global legacy CSS | Keep temporarily | Used by unmigrated pages and shell |

## Regression matrix
Theme: light / dark.
State: no selection / selected + details / selected + details collapsed.
Viewport: desktop >= 1440 / laptop ~ 1280 / tablet ~ 900 / mobile <= 760.
Also test bulk-send modal, search/filter, AI toggle, reply composer,
keyboard focus, unread counts and scrolling.

## Scope limit
This migration **does not claim** to have removed all global CSS.
Other modules need independent dependency audits and migrations before
their legacy files can safely be deleted.
