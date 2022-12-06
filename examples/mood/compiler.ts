import { ExpressionContext, ModuleContext } from "../..";
import { NumType } from "../../types";
import { AstNode } from "./ast";
import parser from "./parser";

export default class Compiler {
  ctx: ModuleContext;
  exp: ExpressionContext;
  constructor() {
    this.ctx = new ModuleContext();
  }

  compile(code: string): Uint8Array {
    const ast: AstNode = parser.parse(code);
    this.emit(ast);
    return new Uint8Array(this.ctx.compile());
  }

  emit(ast: AstNode) {
    switch (ast.type) {
      case "FunctionDeclaration": {
        const name = ast.id.name;
        const params = {};
        for (const param of ast.params) {
          params[param.name] = NumType.F64;
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
