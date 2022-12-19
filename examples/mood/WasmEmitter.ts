import { ExpressionContext, FunctionContext, ModuleContext } from "../..";
import { NumType, Mut } from "../../types";
import {
  AstNode,
  BinaryExpression,
  BlockExpression,
  CallExpression,
  ExpressionPath,
  FunctionDeclaration,
  Literal,
  MemberExpression,
  Program,
  StructConstruction,
  VariableDeclaration,
} from "./ast";
import { SymbolType } from "./SymbolTable";
import TypeTable from "./TypeTable";

/**
 * Populates the ModuleContext with the program defined by AstNode.
 */
export function emit(ctx: ModuleContext, ast: AstNode, typeTable: TypeTable) {
  const emitter = new WasmEmitter(ctx, typeTable);
  emitter.emit(ast);
}

const STACK_FRAME_SIZE = 500;
export class WasmEmitter {
  ctx: ModuleContext;
  func: FunctionContext;
  exp: ExpressionContext;
  _typeTable: TypeTable;
  _globals: Map<string, number> = new Map();
  _functions: Map<string, number> = new Map();
  _mallocIndex: number;
  _heapPointerIndex: number;
  fp: number; // Frame pointer
  _locals: Map<string, number>;
  _stackOffset: number = 0;
  constructor(ctx: ModuleContext, typeTable: TypeTable) {
    this.ctx = ctx;
    this._typeTable = typeTable;
    // Start allocation with one page.
    // We don't set a max memory size.
    this.ctx.defineMemory({ min: 10 });
    this._defineBuiltins();
  }

  _defineBuiltins() {
    const i32Mut = { type: NumType.I32, mut: Mut.VAR };
    this.fp = this.ctx.declareGlobal(i32Mut, (init) => {
      init.i32Const(5000);
    });
    /*
    this._heapPointerIndex = this.ctx.declareGlobal(i32Mut, (init) => {
      init.i32Const(0);
    });

    const nextHeapPointerIndex = this.ctx.declareGlobal(i32Mut, (init) => {
      init.i32Const(0);
    });
    */

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
    // TODO: Reenable malloc once we add heap allocations.
    /*
    this._mallocIndex = this.ctx.declareFunction(
      { params: [NumType.I32], results: [] },
      ({ exp }) => defineMalloc(exp),
    );
    */
  }

  emit(ast: AstNode) {
    switch (ast.type) {
      case "Program":
        return this.emitProgram(ast);
      case "FunctionDeclaration":
        return this.emitFunctionDeclaration(ast);
      case "BlockExpression":
        return this.emitBlockExpression(ast);
      case "StructDeclaration":
      case "EnumDeclaration":
        // These are just type declarations, which we processed during type
        // checking. No need to emit anything.
        break;
      case "StructConstruction":
        return this.emitStructConstruction(ast);
      case "MemberExpression":
        return this.emitMemberExpression(ast);
      case "BinaryExpression":
        return this.emitBinaryExpression(ast);
      case "CallExpression":
        return this.emitCallExpression(ast);
      case "ExpressionPath":
        return this.emitExpressionPath(ast);
      case "VariableDeclaration":
        return this.emitVariableDeclaration(ast);
      case "Identifier":
        this.exp.localGet(this.getLocal(ast.name));
        return;
      case "Literal":
        return this.emitLiteral(ast);
      default:
        // @ts-ignore
        throw new Error(`Unknown node type: ${ast.type}`);
    }
  }

  private emitCallExpression(ast: CallExpression) {
    const returnType = this.lookupAstNode(ast.nodeId);
    const offset = this._stackOffset;
    if (returnType.type === "struct") {
      // Allocate space for the struct on the stack.
      this._stackOffset += returnType.size;
      this.exp.globalGet(this.fp); // Destination...
      // Allocate space for the struct on the stack.
      this.exp.i32Const(offset);
      this.exp.i32Sub();
    }
    for (const arg of ast.args) {
      this.emit(arg);
    }
    this.exp.call(this.getFunction(ast.callee.name));
    if (returnType.type === "struct") {
      this.exp.i32Const(returnType.size);
      this.exp.memoryCopy();

      // Return the pointer to the struct.
      this.exp.globalGet(this.fp);
      this.exp.i32Const(offset);
      this.exp.i32Sub();
    }
  }

  emitStructConstruction(ast: StructConstruction) {
    const structType = this.lookupAstNode(ast.nodeId);
    if (structType.type !== "struct") {
      throw new Error("Expected struct type");
    }

    const structOffset = this._stackOffset;

    for (const field of Object.values(structType.fields)) {
      this.exp.globalGet(this.fp);
      const value = ast.fields.find((f) => f.name.name === field.name);
      if (value == null) {
        throw new Error(`Missing field.`);
      }
      this.emit(value.value);
      this.exp.i32Store(field.offset + structOffset, 0);
    }
    this._stackOffset += structType.size;

    // Return the absolute address of the struct.
    this.exp.globalGet(this.fp);
    this.exp.i32Const(structOffset);
    this.exp.i32Add();
  }

  emitMemberExpression(ast: MemberExpression) {
    this.emit(ast.head);
    const struct = this.lookupAstNode(ast.head.nodeId);
    if (struct.type !== "struct") {
      throw new Error("Expected struct type");
    }
    const field = struct.fields[ast.tail.name];
    this.exp.i32Load(field.offset, 0);
  }

  emitBinaryExpression(ast: BinaryExpression) {
    this.emit(ast.left);
    this.emit(ast.right);
    const leftType = this.lookupAstNode(ast.left.nodeId).type;
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
  }

  emitExpressionPath(ast: ExpressionPath) {
    const enumSymbol = this.lookupAstNode(ast.nodeId);
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
  }

  emitVariableDeclaration(ast: VariableDeclaration) {
    const type = this.lookupAstNodeNumType(ast.nodeId);
    const index = this.func.defineLocal(type);
    this.defineLocal(ast.name.name, index);
    this.emit(ast.value);
    this.exp.localTee(index);
  }

  emitLiteral(ast: Literal) {
    const type = this.lookupAstNodeNumType(ast.nodeId);
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
  }

  emitFunctionDeclaration(ast: FunctionDeclaration) {
    const name = ast.id.name;
    const locals = new Map<string, number>();

    const params: NumType[] = [];
    for (const [i, param] of ast.params.entries()) {
      params.push(this.lookupAstNodeNumType(param.nodeId));
      locals.set(param.name.name, i);
    }

    const signature = {
      params,
      results: [this.lookupAstNodeNumType(ast.returnType.nodeId)],
      exportName: ast.public ? name : null,
    };

    const index = this.ctx.declareFunction(signature, (func) => {
      this._stackOffset = 0;
      this.emitPrologue(ast, func);
      this._locals = locals;
      this.exp = func.exp;
      this.func = func;
      this.emit(ast.body);
      if (this._stackOffset > STACK_FRAME_SIZE) {
        throw new Error(
          "TODO: Implement proper stack frame size calculation. Right now we just assume 500 bytes",
        );
      }
      this.emitEpilogue(ast, func);
    });

    // TODO: This won't be compatible with recursive functions.
    this.defineFunction(name, index);
  }

  emitPrologue(ast: FunctionDeclaration, func: FunctionContext) {
    func.exp.globalGet(this.fp);
    func.exp.i32Const(STACK_FRAME_SIZE);
    func.exp.i32Sub();
    func.exp.globalSet(this.fp);
  }

  emitEpilogue(ast: FunctionDeclaration, func: FunctionContext) {
    func.exp.globalGet(this.fp);
    func.exp.i32Const(500);
    func.exp.i32Add();
    func.exp.globalSet(this.fp);
  }

  emitProgram(ast: Program) {
    for (const func of ast.body) {
      this.emit(func);
    }
  }

  emitBlockExpression(ast: BlockExpression) {
    if (ast.expressions.length === 0) {
      return;
    }
    for (let i = 0; i < ast.expressions.length; i++) {
      this.emit(ast.expressions[i]);
      if (i < ast.expressions.length - 1) {
        this.exp.drop();
      }
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
