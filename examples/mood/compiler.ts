import { ExpressionContext, ModuleContext } from "../..";
import { NumType } from "../../types";
import { AstNode, TypeAnnotation } from "./ast";
import * as Parser from "./Parser";
import { typeCheck } from "./TypeChecker";
import DiagnosticError, {
  Result,
  catchToResult,
  annotate,
} from "./DiagnosticError";
import SymbolTable from "./SymbolTable";

export default function compile(source: string): Result<Uint8Array> {
  return catchToResult(() => compileImpl(source));
}

function compileImpl(source: string): Uint8Array {
  const ast = Parser.parse(source) as AstNode;
  const scope = typeCheck(ast); // throws DiagnosticError if type errors are detected
  const compiler = new Compiler();
  compiler.emit(ast, scope);
  return compiler.compile();
}

export class Compiler {
  ctx: ModuleContext;
  exp: ExpressionContext;
  constructor() {
    this.ctx = new ModuleContext();
  }

  compile(): Uint8Array {
    return this.ctx.compile();
  }

  emit(ast: AstNode, scope: SymbolTable) {
    switch (ast.type) {
      case "Program": {
        for (const func of ast.body) {
          this.emit(func, scope);
        }
        break;
      }
      case "FunctionDeclaration": {
        const name = ast.id.name;
        const params = {};
        for (const param of ast.params) {
          params[param.name.name] = typeFromAnnotation(param.annotation, scope);
        }
        this.ctx.declareFunction({
          name,
          params,
          results: [typeFromAnnotation(ast.returnType, scope)],
          export: ast.public,
        });

        const funcScope = scope.lookupFunction(name).scope;
        this.ctx.defineFunction(name, (exp) => {
          this.exp = exp;
          this.emit(ast.body, funcScope);
        });
        break;
      }
      case "BlockExpression": {
        if (ast.expressions.length === 0) {
          break;
        }
        for (let i = 0; i < ast.expressions.length; i++) {
          this.emit(ast.expressions[i], scope);
          if (i < ast.expressions.length - 1) {
            this.exp.drop();
          }
        }
        break;
      }
      case "EnumDeclaration": {
        // This is just a type declaration, which we processed during type
        // checking. No need to emit anything.
        break;
      }
      case "BinaryExpression": {
        this.emit(ast.left, scope);
        this.emit(ast.right, scope);
        switch (ast.operator) {
          case "+":
            // TODO: Check the type
            this.exp.f64Add();
            break;
          case "*":
            this.exp.f64Mul();
            break;
          default:
            throw new Error(`Unknown operator: ${ast.operator}`);
        }
        break;
      }
      case "CallExpression": {
        for (const arg of ast.args) {
          this.emit(arg, scope);
        }
        this.exp.call(ast.callee.name);
        break;
      }
      case "ExpressionPath": {
        const enumSymbol = scope.lookupEnum(ast.head.name);
        const variantIndex = enumSymbol.variants.findIndex((variant) => {
          if (variant.valueType != null) {
            throw new Error("TODO: Support enum variants with values");
          }
          return variant.name === ast.tail.name;
        });
        // TODO: Support enum variants with values
        // For now we'll represent enum variants as i32s of their index.
        this.exp.i32Const(variantIndex);
        break;
      }
      case "VariableDeclaration": {
        const type = typeFromAnnotation(ast.annotation, scope);
        this.exp.defineLocal(ast.name.name, type);
        this.emit(ast.value, scope);
        this.exp.localTee(ast.name.name);
        break;
      }
      case "Identifier": {
        this.exp.localGet(ast.name);
        break;
      }
      case "Literal": {
        const type = typeFromAnnotation(ast.annotation, scope);
        if (typeof ast.value === "boolean") {
          this.exp.i32Const(ast.value ? 1 : 0);
        } else if (typeof ast.value === "number") {
          const value = Number(ast.value);
          switch (type) {
            case NumType.F32:
              this.exp.f32Const(value);
              break;
            case NumType.F64:
              this.exp.f64Const(value);
              break;
            case NumType.I32:
              this.exp.i32Const(value);
              break;
            case NumType.I64:
              this.exp.i64Const(value);
            default:
              throw new Error(
                `Unknown primitive literal name: ${ast.annotation.name}`,
              );
          }
        } else {
          throw new Error(`Unknown primitive literal: ${typeof ast.value}`);
        }

        break;
      }
      case "IfStatement": {
        this.emit(ast.test, scope);
        // Need to cast to i32 because wasm doesn't have a bool type.
        this.exp.i32TruncF64S();
        this.exp.if({ kind: "EMPTY" }, (exp) => {
          this.emit(ast.consequent, scope);
        });
        ast.alternate;
        break;
      }
      default:
        // @ts-ignore
        throw new Error(`Unknown node type: ${ast.type}`);
    }
  }
}

function typeFromAnnotation(
  annotation: TypeAnnotation,
  scope: SymbolTable,
): NumType {
  const type = scope.lookup(annotation.name);
  if (type == null) {
    throw new DiagnosticError(
      `Unknown type "${annotation.name}".`,
      annotate(annotation.loc, "error"),
    );
  }

  switch (type.type) {
    case "f64":
      return NumType.F64;
    case "i32":
      return NumType.I32;
    case "bool":
      return NumType.I32;
    case "enum":
      return NumType.I32;

    default:
      throw new Error(`Unknown type ${type.type}`);
  }
}
