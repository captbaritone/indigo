import peg from "pegjs";
import fs from "fs";
import { ExpressionContext, FunctionContext, ModuleContext } from "..";
import { NumType } from "../types";

const GRAMMAR = fs.readFileSync("./examples/javascript.pegjs", "utf-8");

const parser = peg.generate(GRAMMAR);

class Compiler {
  ctx: ModuleContext;
  exp: ExpressionContext;
  constructor() {
    this.ctx = new ModuleContext();
  }

  compile(code: string) {
    const ast = parser.parse(code);
    this.emit(ast);
    return this.ctx.compile();
  }

  emit(ast: any) {
    switch (ast.type) {
      case "Program":
        for (const statement of ast.body) {
          this.emit(statement);
        }
        break;
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
          export: true,
        });
        this.ctx.defineFunction(name, (exp) => {
          this.exp = exp;
          this.emit(ast.body);
        });
        break;
      }
      case "ReturnStatement": {
        this.emit(ast.argument);
        this.exp.return();
        break;
      }
      case "BinaryExpression": {
        this.emit(ast.left);
        this.emit(ast.right);
        switch (ast.operator) {
          case "+":
            this.exp.f64Add();
            break;
          case "-":
            this.exp.f64Sub();
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
      case "BlockStatement": {
        for (const statement of ast.body) {
          this.emit(statement);
        }
        break;
      }
      default:
        throw new Error(`Unknown node type: ${ast.type}`);
    }
  }
}

const compile = new Compiler();

const binary = new Uint8Array(
  compile.compile(`
function add(a, b) {
  return a + b + 1 - 2 + b;
}

function conditional(x) {
  if (x) {
    return 1;
  }
  return 0;
}
`),
);

const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
// @ts-ignore
console.log(instance.exports.add(1, 2));
// @ts-ignore
console.log(instance.exports.conditional(0));
