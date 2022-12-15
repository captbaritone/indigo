import { ExpressionContext, FunctionContext, ModuleContext } from "../..";
import { NumType, Mut } from "../../types";
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
  func: FunctionContext;
  exp: ExpressionContext;
  _typeTable: TypeTable;
  _globals: Map<string, number> = new Map();
  _functions: Map<string, number> = new Map();
  _mallocIndex: number;
  _heapPointerIndex: number;
  _locals: Map<string, number>;
  constructor(ctx: ModuleContext, typeTable: TypeTable) {
    this.ctx = ctx;
    this._typeTable = typeTable;
    // Start allocation with one page.
    // We don't set a max memory size.
    this.ctx.defineMemory({ min: 1 });
    this._defineBuiltins();
  }

  _defineBuiltins() {
    const i32Mut = { type: NumType.I32, mut: Mut.VAR };
    this._heapPointerIndex = this.ctx.declareGlobal(i32Mut, (init) => {
      init.i32Const(0);
    });

    const nextHeapPointerIndex = this.ctx.declareGlobal(i32Mut, (init) => {
      init.i32Const(0);
    });

    // For now we use a simple bump allocator and simply leak memory under the
    // assumption/hope that we won't run out before the program terminates.
    //
    // Ideally this function would return the "heap_pointer" offset. However,
    // consumers of this function need to duplicate the offset on the stack,
    // since it's used to compute each field's offset. Since Wasm lacks a dupe
    // instruction, we opt instead to make the global "heap_pointer" part of this
    // function's API and let the consumer of this function read to global to get
    // the "returned" offset.
    //
    // This requires careful consideration on the part of the caller since they
    // must ensure that there are no other calls to malloc between the original
    // call and the reading of "heap_pointer". Hopefully in the future we can
    // find a less-brittle solution.
    const defineMalloc = (exp: ExpressionContext) => {
      // TODO: Check that we have free memory and grow if not.
      /*
        exp.defineLocal("over", NumType.I32);
        exp.globalGet("next_heap_pointer");
        // This is given in page size
        // page = 65,536 bytes = 64 KiB
        exp.memorySize();
        exp.i32Sub();
        exp.localTee("over");
        exp.i32Const(0);
        exp.i32LtS();
        exp.if({ kind: "EMPTY" }, (exp) => {
          // TODO: Is this supposed to be page sizes?
          exp.localGet("over");
          exp.memoryGrow();
          // TODO: What if memory grow fails?
          // For now we can just ignore it and trust that we will trap as soon as
          // we try to access the memory.
          exp.drop();
        });
        */
      exp.globalGet(nextHeapPointerIndex);
      exp.globalSet(this._heapPointerIndex);
      exp.localGet(0 /* size */);
      exp.globalGet(nextHeapPointerIndex);
      exp.i32Add();
      exp.globalSet(nextHeapPointerIndex);
    };
    this._mallocIndex = this.ctx.declareFunction(
      { params: [NumType.I32], results: [] },
      ({ exp }) => defineMalloc(exp),
    );
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
        const locals = new Map<string, number>();

        const params: NumType[] = [];
        for (const [i, param] of ast.params.entries()) {
          params.push(this.lookupAstNodeNumType(param.typeId));
          locals.set(param.name.name, i);
        }

        const signature = {
          params,
          results: [this.lookupAstNodeNumType(ast.returnType.typeId)],
          exportName: ast.public ? name : null,
        };

        const index = this.ctx.declareFunction(signature, (func) => {
          this._locals = locals;
          this.exp = func.exp;
          this.func = func;
          this.emit(ast.body);
        });

        // TODO: This won't be compatible with recursive functions.
        this.defineFunction(name, index);

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
      case "StructDeclaration":
      case "EnumDeclaration": {
        // These are just type declarations, which we processed during type
        // checking. No need to emit anything.
        break;
      }
      case "StructConstruction": {
        // Compute struct size
        const structType = this.lookupAstNode(ast.typeId);
        if (structType.type !== "struct") {
          throw new Error("Expected struct type");
        }
        let size = 0;
        for (const field of structType.fields) {
          switch (field.valueType.type) {
            case "struct":
            case "i32":
              size += 4;
              break;
            default:
              throw new Error(`Unhandled field type: ${field.valueType.type}`);
          }
        }
        this.exp.i32Const(size);
        this.exp.call(this._mallocIndex);
        // Store the pointer to the struct
        // This will be the return value of this expression (will not get
        // consumed when assigning fields).
        this.exp.globalGet(this._heapPointerIndex);

        // Each field allocation will be done relative to this pointer and thus
        // will consume one instance of it from the stack.
        // We need to duplicate the pointer on the stack here since it's a global
        // value and thus might be mutated as we recuse into the field values.
        for (const field of structType.fields) {
          this.exp.globalGet(this._heapPointerIndex);
        }

        let offset = 0;
        // I'm going to need to be able to duplicate this.
        // Pointer to the struct is now on the stack
        for (const field of structType.fields) {
          const value = ast.fields.find((f) => f.name.name === field.name);
          if (value == null) {
            throw new Error(`Missing field.`);
          }
          this.emit(value.value);
          this.exp.i32Store(offset, 0);
          switch (field.valueType.type) {
            case "struct":
            case "i32":
              offset += 4;
              break;
            default:
              throw new Error(`Unhandled field type: ${field.valueType.type}`);
          }
        }
        // Earlier we duplicated the pointer to the struct on the stack.
        break;
      }
      case "MemberExpression": {
        this.emit(ast.head);
        const struct = this.lookupAstNode(ast.head.typeId);
        if (struct.type !== "struct") {
          throw new Error("Expected struct type");
        }
        let offset = 0;
        for (const field of struct.fields) {
          if (field.name === ast.tail.name) {
            break;
          }
          offset += 4;
        }
        this.exp.i32Load(offset, 0);
        break;
      }
      case "BinaryExpression": {
        this.emit(ast.left);
        this.emit(ast.right);
        const leftType = this.lookupAstNode(ast.left.typeId).type;
        switch (ast.operator) {
          case "+":
            switch (leftType) {
              case "i32":
                this.exp.i32Add();
                break;
              case "f64":
                this.exp.f64Add();
                break;
              default:
                throw new Error(
                  "Expected LHS of a + operation to be a numeric type",
                );
            }
            break;
          case "*":
            switch (leftType) {
              case "i32":
                this.exp.i32Mul();
                break;
              case "f64":
                this.exp.f64Mul();
                break;
              default:
                throw new Error(
                  "Expected LHS of a * operation to be a numeric type",
                );
            }
            break;
          case "==":
            switch (leftType) {
              case "i32":
              case "bool":
                this.exp.i32Eq();
                break;
              case "f64":
                this.exp.f64Eq();
                break;
              case "struct":
                throw new Error("TODO: Implement struct equality");
              case "enum":
                throw new Error("TODO: Implement enum equality");
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
        this.exp.call(this.getFunction(ast.callee.name));
        break;
      }
      case "ExpressionPath": {
        const enumSymbol = this.lookupAstNode(ast.typeId);
        if (enumSymbol.type !== "enum") {
          throw new Error("Expected enum type");
        }
        const variantIndex = enumSymbol.variants.findIndex((variant) => {
          if (variant.valueType != null || ast.tail.type === "CallExpression") {
            throw new Error("TODO: Support enum variants with values");
          }
          return variant.name === ast.tail.name;
        });
        // TODO: Support enum variants with values
        // For now we'll represent enum variants as i32s of their index allocated on the heap.
        /*
        this.exp.i32Const(4); // Size of an i32 variantIndex
        this.exp.call(this._mallocIndex);
        this.exp.globalGet(this._heapPointerIndex);
        this.exp.globalGet(this._heapPointerIndex);
        this.exp.i32Const(variantIndex);
        this.exp.i32Store(0, 0);
        */

        this.exp.i32Const(variantIndex);
        break;
      }
      case "VariableDeclaration": {
        const type = this.lookupAstNodeNumType(ast.typeId);
        const index = this.func.defineLocal(type);
        this.defineLocal(ast.name.name, index);
        this.emit(ast.value);
        this.exp.localTee(index);
        break;
      }
      case "Identifier": {
        this.exp.localGet(this.getLocal(ast.name));
        break;
      }
      case "Literal": {
        const type = this.lookupAstNodeNumType(ast.typeId);
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
      default:
        // @ts-ignore
        throw new Error(`Unknown node type: ${ast.type}`);
    }
  }
  defineLocal(name: string, index: number) {
    this._locals.set(name, index);
  }
  getLocal(name: string): number {
    const index = this._locals.get(name);
    if (index == null) {
      throw new Error(`Unknown local: ${name}`);
    }
    return index;
  }
  defineFunction(name: string, index: number) {
    if (this._functions.has(name)) {
      throw new Error(`Duplicate function name: "${name}"`);
    }
    this._functions.set(name, index);
  }
  getFunction(name: string): number {
    const index = this._functions.get(name);
    if (index == null) {
      throw new Error(`Unknown function: ${name}`);
    }
    return index;
  }
  lookupAstNode(id: number): SymbolType {
    return this._typeTable.lookup(id);
  }
  lookupAstNodeNumType(id: number): NumType {
    const type = this.lookupAstNode(id);
    return numTypeFromValueType(type);
  }
}

function numTypeFromValueType(type: SymbolType): NumType {
  switch (type.type) {
    case "f64":
      return NumType.F64;
    case "i32":
      return NumType.I32;
    case "bool":
      return NumType.I32;
    case "enum":
      return NumType.I32;
    case "struct":
      return NumType.I32;

    default:
      throw new Error(`Unknown type ${type}`);
  }
}
