/**
 * Global CSS inventory and migration gate for the entire LexOffice repository.
 * Run: node scripts/audit-global-css.mjs
 * Read-only: never modifies production files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = process.cwd();
const scan = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (["node_modules", "dist", ".git", ".vercel"].includes(name)) return [];
  return statSync(path).isDirectory() ? scan(path) : [path];
});
const files = scan(join(root, "src"));
const css = files.filter((f) => f.endsWith(".css"));
const pages = files.filter((f) => /^src\/pages\/[^/]+\.tsx$/.test(relative(root, f).replaceAll("\\", "/")));
const components = files.filter((f) => /^src\/components\/.*\.tsx$/.test(relative(root, f).replaceAll("\\", "/")));
const patterns = {
  important: /!important\b/g,
  hexColor: /#[\da-fA-F]{3,8}\b/g,
  hardcodedRgb: /\brgba?\s*\(/g,
  globalElement: /(?:^|})\s*(?:html|body|aside|main|header|nav|table|input|button|select|textarea)\s*[{,:]/gm,
};
const cssInventory = css.map((f) => {
  const source = readFileSync(f, "utf8");
  return {
    path: relative(root, f).replaceAll("\\", "/"),
    bytes: Buffer.byteLength(source),
    ...Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, [...source.matchAll(pattern)].length])),
  };
});
const tsxInventory = [...pages, ...components].map((f) => {
  const source = readFileSync(f, "utf8");
  return {
    path: relative(root, f).replaceAll("\\", "/"),
    inlineStyleProps: (source.match(/\bstyle\s*=\s*\{/g) || []).length,
    embeddedStyleTags: (source.match(/<style\b/g) || []).length,
    cssImports: [...source.matchAll(/import\s+["']([^"']+\.css)["']/g)].map((m) => m[1]),
  };
});
const report = {
  scope: "entire src tree, all modules, all pages and shared components",
  counts: { css: css.length, pages: pages.length, components: components.length },
  totals: {
    bytes: cssInventory.reduce((n, x) => n + x.bytes, 0),
    important: cssInventory.reduce((n, x) => n + x.important, 0),
    hexColor: cssInventory.reduce((n, x) => n + x.hexColor, 0),
    globalElement: cssInventory.reduce((n, x) => n + x.globalElement, 0),
    inlineStyleProps: tsxInventory.reduce((n, x) => n + x.inlineStyleProps, 0),
  },
  css: cssInventory,
  react: tsxInventory,
};
console.log(JSON.stringify(report, null, 2));
