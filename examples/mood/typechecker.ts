import { AstNode, lastChar, TypeAnnotation, union } from "./ast";
import DiagnosticError, { annotate } from "./DiagnosticError";
import SymbolTable, { SymbolType } from "./SymbolTable";

/**
 * Type-checks the given AST and throws DiagnosticError if type errors are
 * detected.
 */
export function typeCheck(ast: AstNode): SymbolTable {
  const checker = new TypeChecker();
  const scope = new SymbolTable();
  addBuiltinTypes(scope);
  checker.tc(ast, scope);
  return scope;
}

function addBuiltinTypes(scope: SymbolTable): void {
  scope.define("bool", { type: "bool" });
  scope.define("true", { type: "bool" });
  scope.define("false", { type: "bool" });
  scope.define("i32", { type: "i32" });
  scope.define("f64", { type: "f64" });
}

class TypeChecker {
  tc(node: AstNode, scope: SymbolTable): SymbolType {
    switch (node.type) {
      case "Program": {
        let lastType: SymbolType = { type: "empty" };
        for (const child of node.body) {
          lastType = this.tc(child, scope);
        }
        return lastType;
      }
      case "BinaryExpression": {
        const leftType = this.expectNumeric(node.left, scope);
        this.expectType(node.right, leftType, scope);
        switch (node.operator) {
          case "*":
          case "+":
            return leftType;
          case "==":
            return { type: "bool" };
        }
      }
      case "FunctionDeclaration": {
        const functionScope = scope.child();
        const params: SymbolType[] = [];
        for (const param of node.params) {
          const paramType = this.fromAnnotation(param.annotation, scope);
          params.push(paramType);
          functionScope.define(param.name.name, paramType);
        }
        const result = this.fromAnnotation(node.returnType, scope);

        scope.define(node.id.name, {
          type: "function",
          params,
          result,
          scope: functionScope,
        });

        this.expectType(node.body, result, functionScope);
        // A declaration has no type itself.
        return { type: "empty" };
      }
      case "BlockExpression": {
        let lastType: SymbolType = { type: "empty" };
        for (const child of node.expressions) {
          lastType = this.tc(child, scope);
        }
        return lastType;
      }
      case "EnumDeclaration": {
        scope.define(node.id.name, {
          type: "enum",
          variants: node.variants.map((variant) => ({
            name: variant.id.name,
            valueType: null,
          })),
        });
        // A declaration has no type itself.
        return { type: "empty" };
        break;
      }
      case "Identifier": {
        const type = scope.lookup(node.name);
        if (type == null) {
          throw new DiagnosticError(
            "Undefined variable: " + node.name,
            annotate(node.loc, "This variable is not defined."),
          );
        }
        return type;
      }
      case "CallExpression": {
        const func = scope.lookup(node.callee.name);
        if (func == null) {
          throw new DiagnosticError(
            `Undefined function: "${node.callee.name}"`,
            annotate(node.callee.loc, "This function is not defined."),
          );
        }
        if (func.type !== "function") {
          throw new DiagnosticError(
            `Tried calling "${node.callee.name}", but "${node.callee.name}" is not a function.`,
            annotate(node.loc, `"${node.callee.name}" is not a function.`),
          );
        }

        if (node.args.length < func.params.length) {
          const missingCount = func.params.length - node.args.length;
          throw new DiagnosticError(
            `Too few arguments. Expected ${func.params.length} but found ${node.args.length}.`,
            annotate(
              lastChar(node.loc),
              `"${node.callee.name}" requires ${missingCount} more ${
                missingCount === 1 ? "argument" : "arguments"
              }.`,
            ),
          );
        }
        if (node.args.length > func.params.length) {
          const excessCount = node.args.length - func.params.length;
          const excess = node.args.slice(func.params.length);
          const firstLoc = excess[0].loc;
          const lastLoc = excess[excess.length - 1].loc;
          throw new DiagnosticError(
            `Too many arguments. Expected ${func.params.length} but found ${node.args.length}.`,
            annotate(
              union(firstLoc, lastLoc),
              `These arguments are not accepted by "${node.callee.name}".`,
            ),
          );
        }

        for (const [i, arg] of node.args.entries()) {
          this.expectType(arg, func.params[i], scope);
        }
        return func.result;
      }
      case "ExpressionPath": {
        const type = scope.lookup(node.head.name);
        if (type == null) {
          throw new DiagnosticError(
            `Undefined enum "${node.head.name}"`,
            annotate(node.head.loc, `"${node.head.name}" is not defined.`),
          );
        }

        if (type.type !== "enum") {
          throw new DiagnosticError(
            "Expected enum, got " + type.type,
            annotate(node.head.loc, "Expected an enum."),
          );
        }

        const variant = type.variants.find((v) => v.name === node.tail.name);
        if (variant == null) {
          throw new DiagnosticError(
            `Undefined variant "${node.tail.name}"`,
            annotate(
              node.tail.loc,
              `"${node.tail.name}" is not a variant of "${node.head.name}".`,
            ),
          );
        }
        return type;
      }
      case "Literal": {
        if (typeof node.value === "boolean") {
          return { type: "bool" };
        }
        return this.fromAnnotation(node.annotation, scope);
      }
      case "VariableDeclaration": {
        const type = this.fromAnnotation(node.annotation, scope);
        this.expectType(node.value, type, scope);
        scope.define(node.name.name, type);
        return type;
      }
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  expectType(node: AstNode, type: SymbolType, scope: SymbolTable): SymbolType {
    const actual = this.tc(node, scope);
    if (actual.type !== type.type) {
      if (node.loc == null) {
        throw new Error("Node has no location");
      }
      // The type of a BlockExpression comes from its last expression.
      // Special case here to make the error message more useful.
      if (node.type === "BlockExpression" && node.expressions.length > 0) {
        node = node.expressions[node.expressions.length - 1];
      }
      throw new DiagnosticError(
        `Expected "${type.type}", got "${actual.type}"`,
        annotate(node.loc, "This expression has the wrong type."),
      );
    }
    if (actual.type === "function") {
      throw new Error("TODO: Check function types");
    }
    return actual;
  }

  expectNumeric(node: AstNode, scope: SymbolTable): SymbolType {
    const type = this.tc(node, scope);
    if (!(type.type === "f64" || type.type === "i32")) {
      throw new DiagnosticError(
        `Expected a number.`,
        annotate(node.loc, "This expression is not numeric."),
      );
    }
    return type;
  }

  fromAnnotation(annotation: TypeAnnotation, scope: SymbolTable): SymbolType {
    const found = scope.lookup(annotation.name);
    if (found == null) {
      throw new DiagnosticError(
        "Unknown type: " + annotation.name,
        annotate(annotation.loc, "This type is not defined."),
      );
    }
    return found;
  }
}
