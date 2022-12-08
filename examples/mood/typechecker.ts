import { AstNode } from "./ast";
import DiagnosticError, {
  annotate,
  AnnotatedLocation,
} from "./DiagnosticError";

export function typeCheck(ast: AstNode) {
  const checker = new TypeChecker();
  checker.tc(ast, new Scope());
  return [];
}

type Type_ =
  | {
      type: "f64";
    }
  | {
      type: "i32";
    }
  | {
      type: "empty";
    }
  | {
      type: "function";
      params: Type_[];
      result: Type_;
    };

class Scope {
  _variables: Map<string, Type_> = new Map();
  _parent: Scope | null = null;

  constructor(parent: Scope | null = null) {
    this._parent = parent;
  }

  define(name: string, type: Type_) {
    this._variables.set(name, type);
  }

  lookup(name: string): Type_ | null {
    const found = this._variables.get(name);
    if (found != null) {
      return found;
    }
    if (this._parent != null) {
      return this._parent.lookup(name);
    }
    return null;
  }

  child(): Scope {
    return new Scope(this);
  }
}

class TypeChecker {
  tc(node: AstNode, scope: Scope): Type_ {
    switch (node.type) {
      case "Program": {
        let lastType: Type_ = { type: "empty" };
        for (const child of node.body) {
          lastType = this.tc(child, scope);
        }
        return lastType;
      }
      case "BinaryExpression": {
        const leftType = this.expectNumeric(node.left, scope);
        return this.expectType(node.right, leftType, scope);
      }
      case "FunctionDeclaration": {
        const functionScope = scope.child();
        const params: Type_[] = [];
        for (const param of node.params) {
          const paramType = this.fromAnnotation(param.annotation);
          params.push(paramType);
          functionScope.define(param.name.name, paramType);
        }
        const result = this.fromAnnotation(node.returnType);

        scope.define(node.id.name, {
          type: "function",
          params,
          result,
        });

        return this.expectType(node.body, result, functionScope);
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
            "Undefined function: " + node.callee.name,
            annotate(node.loc, "This function is not defined."),
          );
        }
        if (func.type !== "function") {
          throw new DiagnosticError(
            "Tried calling ${node.callee.name} as a function, but it is not a function.",
            annotate(node.loc, "This is not a function."),
          );
        }

        if (node.args.length < func.params.length) {
          throw new DiagnosticError(
            `Too few arguments. Expected ${func.params.length}, but found ${node.args.length}`,
            annotate(node.loc, "This function requires more arguments."),
          );
        }
        if (node.args.length > func.params.length) {
          throw new DiagnosticError(
            `Too many arguments. Expected ${func.params.length}, but found ${node.args.length}`,
            annotate(node.loc, "This function requires fewer arguments."),
          );
        }

        for (const [i, arg] of node.args.entries()) {
          this.expectType(arg, func.params[i], scope);
        }
        return func.result;
      }
      case "Literal": {
        // TODO: For now all literals are f64, but we should support i32 literals and eventually strings.
        if (typeof node.value !== "number") {
          return { type: "f64" };
        } else {
          throw new Error("Non-number literals are not yet supported.");
        }
      }
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  expectType(node: AstNode, type: Type_, scope: Scope): Type_ {
    const actual = this.tc(node, scope);
    if (actual.type !== type.type) {
      throw new DiagnosticError(
        `Expected ${type.type}, got ${actual.type}`,
        annotate(node.loc, "This expression has the wrong type."),
      );
    }
    return actual;
  }

  expectNumeric(node: AstNode, scope: Scope): Type_ {
    const type = this.tc(node, scope);
    if (!(type.type === "f64" || type.type === "i32")) {
      throw new DiagnosticError(
        `Expected the left hand side of a binary expression to be numeric.`,
        annotate(node.loc, "This expression is not numeric."),
      );
    }
    return type;
  }

  fromAnnotation(annotation: string): Type_ {
    switch (annotation) {
      case "f64":
        return { type: "f64" };
      case "i32":
        return { type: "i32" };
      default:
        throw new Error(`Unknown type ${annotation}`);
    }
  }
}