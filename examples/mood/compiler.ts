import { ExpressionContext, ModuleContext } from "../..";
import { NumType } from "../../types";
import { AstNode } from "./ast";
import parser from "./parser";
import { typeCheck } from "./typechecker";
import { Result, catchToResult } from "./DiagnosticError";

export default function compile(source: string): Result<Uint8Array> {
  return catchToResult(() => compileImpl(source));
}

function compileImpl(source: string): Uint8Array {
  const ast = parser.parse(source) as AstNode;
  typeCheck(ast); // throws DiagnosticError if type errors are detected
  const compiler = new Compiler();
  compiler.emit(ast);
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

  emit(ast: AstNode) {
    switch (ast.type) {
      case "Program": {
        for (const func of ast.body) {
          this.emit(func);
        }
        break;
      }
      case "FunctionDeclaration": {
        const name = ast.id.name;
        const params = {};
        for (const param of ast.params) {
          switch (param.annotation) {
            case "f64":
              params[param.name.name] = NumType.F64;
              break;
            default:
              throw new Error(`Unknown type ${param.annotation}`);
          }
        }
        this.ctx.declareFunction({
          name,
          params,
          results: [NumType.F64],
          export: ast.public,
        });
        this.ctx.defineFunction(name, (exp) => {
          this.exp = exp;
          this.emit(ast.body);
        });
        break;
      }
      case "EnumDeclaration": {
        break;
      }
      case "BinaryExpression": {
        this.emit(ast.left);
        this.emit(ast.right);
        switch (ast.operator) {
          case "+":
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
          this.emit(arg);
        }
        this.exp.call(ast.callee.name);
        break;
      }
      case "Identifier": {
        this.exp.localGet(ast.name);
        break;
      }
      case "Literal": {
        if (typeof ast.value !== "number") {
          throw new Error(`Unknown literal: ${ast.value}`);
        }
        this.exp.f64Const(ast.value);
        break;
      }
      case "IfStatement": {
        this.emit(ast.test);
        // Need to cast to i32 because wasm doesn't have a bool type.
        this.exp.i32TruncF64S();
        this.exp.if({ kind: "EMPTY" }, (exp) => {
          this.emit(ast.consequent);
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
