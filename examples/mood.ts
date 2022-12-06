import peg from "pegjs";
import fs from "fs";
import { ExpressionContext, ModuleContext } from "..";
import { NumType } from "../types";
const GRAMMAR = fs.readFileSync("./examples/mood.pegjs", "utf-8");

const parser = peg.generate(GRAMMAR);

type AstNode = FunctionDeclaration | Expression;
type Expression = Identifier | Literal | IfStatement | BinaryExpression;

type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Identifier[];
  public: boolean;
  body: Expression;
};

type Identifier = {
  type: "Identifier";
  name: string;
};

type Literal = {
  type: "Literal";
  value: number | string;
};

type BinaryExpression = {
  type: "BinaryExpression";
  left: Expression;
  right: Expression;
  operator: "+" | "*";
};

type IfStatement = {
  type: "IfStatement";
  test: Expression;
  consequent: Expression;
  alternate: Expression | null;
};

class Compiler {
  ctx: ModuleContext;
  exp: ExpressionContext;
  constructor() {
    this.ctx = new ModuleContext();
  }

  compile(code: string) {
    const ast: AstNode = parser.parse(code);
    this.emit(ast);
    return this.ctx.compile();
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

const compile = new Compiler();
const code = `pub fn add(a, b) { a + b }`;
const binary = new Uint8Array(compile.compile(code));

const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
// @ts-ignore
console.log(instance.exports.add(1, 2));
