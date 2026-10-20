// Regression guard for React #310: no hooks after conditional returns in App.
// TypeScript AST is used instead of regex, so formatting changes do not affect the check.
import fs from 'node:fs';
import ts from 'typescript';

const filename = 'src/App.tsx';
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let violations = [];
function isHookCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expr = node.expression;
  const name = ts.isIdentifier(expr) ? expr.text : ts.isPropertyAccessExpression(expr) ? expr.name.text : '';
  return /^use[A-Z0-9]/.test(name);
}
function scanTopLevelFunction(fn, name) {
  if (!fn.body || !ts.isBlock(fn.body)) return;
  let conditionalReturnSeen = false;
  for (const stmt of fn.body.statements) {
    // Top-level guard clauses are a common cause of hook order mismatches.
    if (ts.isIfStatement(stmt)) {
      const containsReturn = (node) => {
        if (ts.isReturnStatement(node)) return true;
        if (ts.isFunctionLike(node)) return false;
        return ts.forEachChild(node, containsReturn) || false;
      };
      if (containsReturn(stmt.thenStatement) || (stmt.elseStatement && containsReturn(stmt.elseStatement))) conditionalReturnSeen = true;
    }
    if (conditionalReturnSeen) {
      const findHook = (node) => {
        if (isHookCall(node)) {
          const loc = source.getLineAndCharacterOfPosition(node.getStart(source));
          violations.push(`${name}:${loc.line + 1}: React Hook after conditional return`);
        }
        if (ts.isFunctionLike(node)) return;
        ts.forEachChild(node, findHook);
      };
      findHook(stmt);
    }
  }
}
for (const stmt of source.statements) {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) scanTopLevelFunction(stmt, stmt.name.text);
  if (ts.isVariableStatement(stmt)) for (const decl of stmt.declarationList.declarations) {
    if (ts.isIdentifier(decl.name) && decl.initializer && ts.isArrowFunction(decl.initializer)) scanTopLevelFunction(decl.initializer, decl.name.text);
  }
}
if (violations.length) { console.error(violations.join('\n')); process.exit(1); }
console.log('React hook ordering guard passed.');
