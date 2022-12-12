import { ExpressionContext, ModuleContext } from "../..";
import { NumType } from "../../types";
import { AstNode } from "./ast";
import { SymbolType } from "./SymbolTable";
import TypeTable from "./TypeTable";

/**
 * Populates the ModuleContext with the program defined by AstNode.
 */
export function emit(ctx: ModuleContext, ast: AstNode, typeTable: TypeTable) {
  const emitter = new WasmEmitter(ctx, typeTable);
  emitter.emit(ast);
}

export class WasmEmitter {
  ctx: ModuleContext;
  typeTable: TypeTable;
  exp: ExpressionContext;
  constructor(ctx: ModuleContext, typeTable: TypeTable) {
    this.ctx = ctx;
    this.typeTable = typeTable;
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
          params[param.name.name] = numTypeFromType(
            this.typeTable.lookupAstNode(param.typeId),
          );
        }
        this.ctx.declareFunction({
          name,
          params,
          results: [
            numTypeFromType(
              this.typeTable.lookupAstNode(ast.returnType.typeId),
            ),
          ],
          export: ast.public,
        });

        this.ctx.defineFunction(name, (exp) => {
          this.exp = exp;
          this.emit(ast.body);
        });
        break;
      }
      case "BlockExpression": {
        if (ast.expressions.length === 0) {
          break;
        }
        for (let i = 0; i < ast.expressions.length; i++) {
          this.emit(ast.expressions[i]);
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
        this.emit(ast.left);
        this.emit(ast.right);
        switch (ast.operator) {
          case "+":
            // TODO: Check the type
            this.exp.f64Add();
            break;
          case "*":
            this.exp.f64Mul();
            break;
          case "==":
            switch (this.typeTable.lookupAstNode(ast.left.typeId).type) {
              case "i32":
              case "bool":
              case "enum":
                this.exp.i32Eq();
                break;
              case "f64":
                this.exp.f64Eq();
                break;
              default:
                throw new Error(
                  `Equality comparison is not supported for the type: ${ast.left.type}`,
                );
            }
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
      case "ExpressionPath": {
        const enumSymbol = this.typeTable.lookupAstNode(ast.typeId);
        if (enumSymbol.type !== "enum") {
          throw new Error("Expected enum type");
        }
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
        const type = this.typeTable.lookupAstNode(ast.typeId);
        this.exp.defineLocal(ast.name.name, numTypeFromType(type));
        this.emit(ast.value);
        this.exp.localTee(ast.name.name);
        break;
      }
      case "Identifier": {
        this.exp.localGet(ast.name);
        break;
      }
      case "Literal": {
        const type = numTypeFromType(this.typeTable.lookupAstNode(ast.typeId));
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

function numTypeFromType(type: SymbolType): NumType {
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
