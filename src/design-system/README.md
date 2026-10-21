# LexOffice Design System

The approved navy / blue / restrained gold identity lives in `tokens.css`.
Light and dark themes use **the same semantic variables**, controlled by
`html[data-lex-theme]` and the existing `ThemeController`.

## Migration policy
1. Inventory the target module's selectors and behavior before changing CSS.
2. Move its styling into one scoped stylesheet. Remove its former inline rules.
3. Use semantic `--lx-*` tokens; do not hardcode theme-specific values in modules.
4. Use `lx-*` shared components or local module classes. Avoid broad element selectors.
5. Check empty, selected, collapsed and narrow layouts in both themes.
6. Remove legacy rules only after proving no other module consumes them.
7. Do not merge on green compilation alone. Validate the authenticated preview visually.

## Initial migration scope
`Service.tsx` (Caixa de Entrada) is the pilot. Its legacy inline CSS and
`service-2.css` override stack are replaced by `service-workspace.css`.
Other modules still use legacy global CSS until individually migrated.
