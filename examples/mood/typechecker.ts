import {
  AstNode,
  BinaryExpression,
  BlockExpression,
  CallExpression,
  EnumDeclaration,
  ExpressionPath,
  FunctionDeclaration,
  Identifier,
  Literal,
  MemberExpression,
  Program,
  StructConstruction,
  StructDeclaration,
  TypeAnnotation,
  VariableDeclaration,
  VariantDeclaration,
} from "./ast";
import { lastChar, union } from "./Location";
import DiagnosticError, { annotate } from "./DiagnosticError";
import SymbolTable, { SymbolType } from "./SymbolTable";
import TypeTable from "./TypeTable";

/**
 * Type-checks the given AST and throws DiagnosticError if type errors are
 * detected.
 */
export function typeCheck(ast: AstNode): TypeTable {
  const typeTable = new TypeTable();
  const checker = new TypeChecker(typeTable);
  const scope = new SymbolTable();
  addBuiltinTypes(scope);
  checker.tc(ast, scope);
  return typeTable;
}

function addBuiltinTypes(scope: SymbolTable): void {
  scope.define("bool", { type: "bool" });
  scope.define("true", { type: "bool" });
  scope.define("false", { type: "bool" });
  scope.define("i32", { type: "i32" });
  scope.define("f64", { type: "f64" });
}

class TypeChecker {
  _typeTable: TypeTable;
  constructor(typeTable: TypeTable) {
    this._typeTable = typeTable;
  }

  tc(node: AstNode, scope: SymbolTable): SymbolType {
    switch (node.type) {
      case "Program": {
        return this.tcProgram(node, scope);
      }
      case "BinaryExpression": {
        return this.tcBinaryExpression(node, scope);
      }
      case "FunctionDeclaration": {
        return this.tcFunctionDeclaration(scope, node);
      }
      case "StructDeclaration": {
        return this.tcStructDeclaration(node, scope);
      }
      case "Parameter": {
        const paramType = this.fromAnnotation(node.annotation, scope);
        return this.typeAstNode(node.nodeId, paramType);
      }
      case "StructConstruction": {
        return this.tcStructConstruction(node, scope);
      }
      case "BlockExpression": {
        return this.tcBlockExpression(node, scope);
      }
      case "EnumDeclaration": {
        return this.tcEnumDeclaration(node, scope);
      }
      case "Identifier": {
        return this.tcIdentifier(node, scope);
      }
      case "CallExpression": {
        return this.tcCallExpression(node, scope);
      }
      case "ExpressionPath": {
        return this.tcExpressionPath(node, scope);
      }
      case "Literal": {
        return this.tcLiteral(node, scope);
      }
      case "VariableDeclaration": {
        return this.tcVariableDeclaration(node, scope);
      }
      case "MemberExpression": {
        return this.tcMemberExpression(node, scope);
      }
      default:
        // @ts-ignore
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  tcMemberExpression(node: MemberExpression, scope: SymbolTable): SymbolType {
    const head = this.tc(node.head, scope);
    if (head.type !== "struct") {
      throw new DiagnosticError(
        `Cannot access member of non-struct type.`,
        annotate(node.head.loc, `Type is ${head.type}`),
      );
    }
    const tail = head.fields.find((f) => f.name === node.tail.name);
    if (tail == null) {
      throw new DiagnosticError(
        `Struct "${head.name}" does not have a field named "${node.tail.name}".`,
        annotate(node.tail.loc, `Type is ${head.type}`),
      );
    }
    return this.typeAstNode(node.nodeId, tail.valueType);
  }

  tcVariableDeclaration(node: VariableDeclaration, scope: SymbolTable) {
    const type = this.fromAnnotation(node.annotation, scope);
    this.expectType(node.value, type, scope);
    scope.define(node.name.name, type);
    return this.typeAstNode(node.nodeId, type);
  }

  tcLiteral(node: Literal, scope: SymbolTable) {
    const type =
      typeof node.value === "boolean"
        ? ({ type: "bool" } as const)
        : this.fromAnnotation(node.annotation, scope);

    return this.typeAstNode(node.nodeId, type);
  }

  tcExpressionPath(node: ExpressionPath, scope: SymbolTable) {
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

    const tail = node.tail;

    switch (tail.type) {
      case "Identifier":
        {
          const variant = type.variants.find((v) => v.name === tail.name);
          if (variant == null) {
            throw new DiagnosticError(
              `Undefined variant "${tail.name}"`,
              annotate(
                tail.loc,
                `"${tail.name}" is not a variant of "${node.head.name}".`,
              ),
            );
          }
          if (variant.valueType != null) {
            throw new DiagnosticError(
              `Variant "${tail.name}" is not a unit variant. Expected a value of type "${variant.valueType.type}".`,
              annotate(lastChar(tail.loc), `Expected a value here.`),
            );
          }
        }
        break;
      case "CallExpression": {
        const variant = type.variants.find((v) => v.name === tail.callee.name);
        if (variant == null) {
          throw new DiagnosticError(
            `Undefined variant "${tail.callee.name}"`,
            annotate(
              tail.loc,
              `"${tail.callee.name}" is not a variant of "${node.head.name}".`,
            ),
          );
        }
        if (tail.args.length === 0) {
          throw new DiagnosticError(
            `Variant "${tail.callee.name}" is not a unit variant. Expected a value argument.`,
            annotate(lastChar(tail.loc), `Expected a value here.`),
          );
        }
        if (tail.args.length > 1) {
          const excessiveArgs = tail.args.slice(1);
          const first = excessiveArgs[0];
          const last = excessiveArgs[excessiveArgs.length - 1];
          throw new DiagnosticError(
            `Variant "${tail.callee.name}" is not a unit variant. Expected a single value argument, but got ${tail.args.length}.`,
            annotate(
              union(first.loc, last.loc),
              `Unexpected ${excessiveArgs.length > 1 ? "values" : "value"}.`,
            ),
          );
        }
        const arg = tail.args[0];
        this.typeAstNode(
          arg.nodeId,
          this.expectType(arg, variant.valueType!, scope),
        );
        break;
      }
      default:
        // @ts-ignore
        throw new Error("Unexpected tail type: " + tail.type);
    }
    return this.typeAstNode(node.nodeId, type);
  }

  tcCallExpression(node: CallExpression, scope: SymbolTable) {
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
    return this.typeAstNode(node.nodeId, func.result);
  }

  tcIdentifier(node: Identifier, scope: SymbolTable) {
    const type = scope.lookup(node.name);
    if (type == null) {
      throw new DiagnosticError(
        "Undefined variable: " + node.name,
        annotate(node.loc, "This variable is not defined."),
      );
    }
    return this.typeAstNode(node.nodeId, type);
  }

  tcEnumDeclaration(node: EnumDeclaration, scope: SymbolTable): SymbolType {
    scope.define(node.id.name, {
      type: "enum",
      name: node.id.name,
      variants: node.variants.map((variant) => ({
        name: variant.id.name,
        valueType: this.tcVariantDeclarationValue(variant, scope),
      })),
    });
    // A declaration has no type itself.
    return { type: "empty" };
  }

  tcVariantDeclarationValue(
    variant: VariantDeclaration,
    scope: SymbolTable,
  ): SymbolType | null {
    if (variant.valueType != null) {
      return this.fromAnnotation(variant.valueType, scope);
    }
    return null;
  }

  tcBlockExpression(node: BlockExpression, scope: SymbolTable): SymbolType {
    let lastType: SymbolType = { type: "empty" };
    for (const child of node.expressions) {
      lastType = this.tc(child, scope);
    }
    return lastType;
  }

  tcStructConstruction(
    node: StructConstruction,
    scope: SymbolTable,
  ): SymbolType {
    const struct = scope.lookup(node.id.name);
    // Undefined
    if (struct == null) {
      throw new DiagnosticError(
        `Undefined struct: "${node.id.name}".`,
        annotate(node.id.loc, "This struct is not defined."),
      );
    }
    // Wrong type
    if (struct.type !== "struct") {
      throw new DiagnosticError(
        `Tried to use a ${struct.type} as a struct.`,
        annotate(
          node.id.loc,
          `"${node.id.name}" is a ${struct.type} not a struct.`,
        ),
      );
    }
    // Missing fields
    const missingFields = struct.fields.filter((field) => {
      return !node.fields.some((f) => f.name.name === field.name);
    });
    if (missingFields.length > 0) {
      // TODO: Handle singular/plural correctly.
      const names = missingFields.map((f) => `"${f.name}"`).join(", ");
      throw new DiagnosticError(
        `Missing struct field(s): ${names}.`,
        annotate(
          lastChar(node.loc),
          `"${node.id.name}" is missing the field(s) ${names}.`,
        ),
      );
    }
    // Type-check/annotate the fields.
    for (const field of node.fields) {
      const fieldType = struct.fields.find((f) => f.name === field.name.name);
      // Incorrect field names
      if (fieldType == null) {
        // TODO: Could recommend a field name based on edit distance.
        throw new DiagnosticError(
          `Undefined struct field: "${field.name.name}".`,
          annotate(
            field.name.loc,
            `"${field.name.name}" is not a field of "${node.id.name}".`,
          ),
        );
      }
      this.typeAstNode(field.name.nodeId, fieldType.valueType);
      this.expectType(field.value, fieldType.valueType, scope);
    }
    return this.typeAstNode(node.nodeId, struct);
  }

  tcStructDeclaration(node: StructDeclaration, scope: SymbolTable): SymbolType {
    const fields: { name: string; valueType: SymbolType }[] = [];
    for (const field of node.fields) {
      const fieldType = this.fromAnnotation(field.annotation, scope);
      fields.push({ name: field.id.name, valueType: fieldType });
    }
    scope.define(node.id.name, { type: "struct", name: node.id.name, fields });
    // A declaration has no type itself.
    return { type: "empty" };
  }

  tcFunctionDeclaration(
    scope: SymbolTable,
    node: FunctionDeclaration,
  ): SymbolType {
    const functionScope = scope.child();
    const params: SymbolType[] = [];
    for (const param of node.params) {
      const paramType = this.tc(param, scope);
      params.push(paramType);
      functionScope.define(param.name.name, paramType);
    }
    const result = this.fromAnnotation(node.returnType, scope);
    this.typeAstNode(node.returnType.nodeId, result);

    scope.define(node.id.name, {
      type: "function",
      params,
      result,
    });

    this.expectType(node.body, result, functionScope);
    // A declaration has no type itself.
    return { type: "empty" };
  }

  tcBinaryExpression(node: BinaryExpression, scope: SymbolTable): SymbolType {
    const leftType = this.tc(node.left, scope);
    switch (node.operator) {
      case "*":
      case "+": {
        if (!(leftType.type === "f64" || leftType.type === "i32")) {
          throw new DiagnosticError(
            `Expected a number.`,
            annotate(node.left.loc, "This expression is not numeric."),
          );
        }
        this.expectType(node.right, leftType, scope);
        return this.typeAstNode(node.nodeId, leftType);
      }
      case "==": {
        if (
          !(
            leftType.type === "f64" ||
            leftType.type === "i32" ||
            leftType.type === "bool" ||
            leftType.type === "enum" ||
            leftType.type === "struct"
          )
        ) {
          throw new DiagnosticError(
            `The type "${leftType.type}" does not support equality comparison.`,
            annotate(node.left.loc, "Unexpected type."),
          );
        }
        this.expectType(node.right, leftType, scope);
        return this.typeAstNode(node.nodeId, { type: "bool" });
      }
    }
  }

  tcProgram(node: Program, scope: SymbolTable) {
    let lastType: SymbolType = { type: "empty" };
    for (const child of node.body) {
      lastType = this.tc(child, scope);
    }
    return lastType;
  }

  typeAstNode(nodeId: number, type: SymbolType): SymbolType {
    return this._typeTable.define(nodeId, type);
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
        annotate(node.loc, `Expected "${type.type}".`),
      );
    }
    if (actual.type === "function") {
      throw new Error("TODO: Check function types");
    }
    return actual;
  }

  _expectNumeric(node: AstNode, scope: SymbolTable): SymbolType {
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
    return this.typeAstNode(annotation.nodeId, found);
  }
}
