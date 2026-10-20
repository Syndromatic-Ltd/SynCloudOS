import { readFileSync } from "node:fs";
import ts from "typescript";
function unwrap(expression) {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}
function literalValue(expression, sourceFile, seen = new Set()) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) throw new TypeError(`Manifest identifier "${node.text}" is recursive.`);
    const declaration = sourceFile.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === node.text);
    if (!declaration?.initializer) throw new TypeError(`Manifest identifier "${node.text}" must resolve to a static declaration.`);
    return literalValue(declaration.initializer, sourceFile, new Set([...seen, node.text]));
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(element => {
    if (ts.isSpreadElement(element)) throw new TypeError("Manifest arrays cannot use spread expressions.");
    return literalValue(element, sourceFile, seen);
  });
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !property.name) throw new TypeError("Manifest objects must contain only plain property assignments.");
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name) ? property.name.text : null;
      if (!key) throw new TypeError("Manifest property names must be static.");
      Object.defineProperty(value, key, {value:literalValue(property.initializer, sourceFile, seen),enumerable:true});
    }
    return value;
  }
  throw new TypeError("Info.ts must export a static manifest literal.");
}
export function parseManifest(path) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const assignment = source.statements.find(ts.isExportAssignment);
  if (!assignment) throw new TypeError(`${path} must use an export default manifest object.`);
  return literalValue(assignment.expression, source);
}

/** Reject demonstrably wrong entry exports without executing application code. */
export function assertExpectedDefaultExport(path, factory = null, expected = "a React component or an NSEApplication subclass") {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fail = () => { throw new TypeError(`${path} must default-export ${expected}.`); };
  if (source.parseDiagnostics.length) fail();
  const statement = source.statements.find(node =>
    ts.isExportAssignment(node) && !node.isExportEquals
    || (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  if (!statement) {
    if (source.statements.some(node => ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.some(element => element.name.text === "default"))) return;
    fail();
  }
  let value = ts.isExportAssignment(statement) ? unwrap(statement.expression) : statement;
  const seen = new Set();
  while (ts.isIdentifier(value)) {
    if (seen.has(value.text)) fail();
    seen.add(value.text);
    const declaration = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [node])
      .find(node => node.name && ts.isIdentifier(node.name) && node.name.text === value.text);
    if (!declaration) return; // Imported components/definitions are checked by the runtime.
    if (ts.isVariableDeclaration(declaration)) {
      if (!declaration.initializer) fail();
      value = unwrap(declaration.initializer);
    } else value = declaration;
  }
  if (!factory) {
    if (!ts.isFunctionDeclaration(value) && !ts.isFunctionExpression(value) && !ts.isArrowFunction(value) && !ts.isClassDeclaration(value) && !ts.isClassExpression(value) && !ts.isCallExpression(value)) fail();
    return;
  }
  if (!ts.isCallExpression(value)) fail();
  const callee = value.expression;
  let name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node)) continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      const binding = bindings.elements.find(binding => binding.name.text === name);
      if (binding) name = binding.propertyName?.text ?? binding.name.text;
    }
  }
  if (name !== factory) fail();
}
