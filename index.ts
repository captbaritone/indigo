import {
  FuncType,
  ResultType,
  ValType,
  Export,
  ExportDesc,
  Code,
  LocalDeclaration,
  Expression,
  GlobalType,
  Global,
  BlockType,
  MemType,
  Limits,
} from "./types";
import * as Encoding from "./encoding";

type FunctionDeclaration = {
  params: ValType[];
  results: ValType[];
};

/**
 * ModuleContext
 *
 * Used to build up a WebAssembly module. Once the module is complete, it can be
 * compiled into a binary format using `.compile()`.
 *
 * https://webassembly.github.io/spec/core/binary/
 */
export class ModuleContext {
  // TODO: Can this be a dataview so that we don't have to store the floats?
  _bytes: number[] = [];
  _funcTypes: FuncType[] = [];
  _functions: number[] = []; // funcidx[]
  _exports: Export[] = [];
  _code: FunctionContext[] = [];
  _globals: Global[] = [];
  _memories: MemType[] = []; // memidx[]

  getFunctionTypeIndex(funcType: FuncType): number {
    const existingFuncTypeIndex = this._funcTypes.findIndex((existing) => {
      return funcTypesAreEqual(existing, funcType);
    });
    if (existingFuncTypeIndex !== -1) {
      return existingFuncTypeIndex;
    }
    const nextFuncTypeIndex = this._funcTypes.length;
    this._funcTypes.push(funcType);
    return nextFuncTypeIndex;
  }

  declareFunction(func: FunctionDeclaration): number {
    const functionContext = new FunctionContext(
      this,
      func.params,
      func.results,
    );
    const funcTypeIndex = this.getFunctionTypeIndex(
      functionContext.getFuncType(),
    );

    const nextFuncIndex = this._functions.length;
    this._functions.push(funcTypeIndex);

    this._code.push(functionContext);
    return nextFuncIndex;
  }

  // TODO: What about export order? I think exports need to come first?
  exportFunction(name: string, index: number): void {
    this._exports.push({
      name,
      exportDesc: ExportDesc.FUNC_IDX,
      index,
    });
  }

  defineFunction(index: number, cb: (func: FunctionContext) => void) {
    const func = this._code[index];
    if (func == null) {
      throw new Error(`Function "${name}" does not exist`);
    }
    cb(func);
  }

  declareGlobal(global: Global): number {
    const index = this._globals.length;
    this._globals.push(global);
    return index;
  }

  /**
   * Define a new memory and receive the index of said memory.
   */
  defineMemory(mem: MemType): number {
    const index = this._memories.length;
    if (index > 0) {
      throw new Error(
        "In the current version of WebAssembly, only one memory is allowed.",
      );
    }
    this._memories.push(mem);
    return index;
  }

  /**
   * Takes the populated context and emits the wasm binary as a Uint8Array.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#binary-module
   */
  compile(): Uint8Array {
    // The encoding of a module starts with a preamble containing a 4-byte magic
    // number (the string "\0asm") and a version field. The current version of
    // the WebAssembly binary format is 1.
    this._writeMagic();
    this._writeVersion();

    // Individual sections are encoded as follows:
    // https://webassembly.github.io/spec/core/binary/modules.html#sections
    this._writeTypesSection();
    this._writeImportsSection();
    this._writeFunctionsSection();
    this._writeMemorySection();
    this._writeGlobalsSection();
    this._writeExportsSection();
    // this._writeStartSection();
    // this._writeElementsSection();
    this._writeCodeSection();
    // this._writeDataSection();
    // this._writeDataCountSection();
    return new Uint8Array(this._bytes);
  }

  /**
   * Convenience method for getting a compiled Wasm module.
   */
  async getModule(): Promise<WebAssembly.Module> {
    const bytes = this.compile();
    return await WebAssembly.compile(bytes);
  }

  /**
   * Convenience method for compiling the Wasm module and instantiating an instance.
   *
   * Note: If you are going to create multiple instances of the same module, it
   * is preferable to use `.getModule()` and then instantiate the module
   * multiple times.
   */
  async getInstance(): Promise<WebAssembly.Instance> {
    const mod = await this.getModule();
    return await WebAssembly.instantiate(mod);
  }

  /**
   * The encoding of a module starts with a preamble containing a 4-byte magic
   * number (the string "\0asm").
   */
  _writeMagic() {
    this._writeBytes(0x00, 0x61, 0x73, 0x6d);
  }

  /**
   * The current version of the WebAssembly binary format is 1.
   */
  _writeVersion() {
    this._writeBytes(0x01, 0x00, 0x00, 0x00);
  }

  /**
   * The type section has the id 1. It decodes into a vector of function types
   * that represent the _types_ component of a module.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#type-section
   */
  _writeTypesSection() {
    this._writeSection(0x01, () => {
      this._writeVec(this._funcTypes, (funcType) => {
        this._writeFunctionType(funcType);
      });
    });
  }

  _writeImportsSection() {}

  /**
   * The function section has the id 3. It decodes into a vector of type indices
   * that represent the type fields of the functions in the funcs component of a
   * module. The locals and body fields of the respective functions are encoded
   * separately in the code section.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#binary-funcsec
   */
  _writeFunctionsSection() {
    this._writeSection(0x03, () => {
      this._writeVec(this._functions, (funcIndex) => {
        this._writeIndex(funcIndex);
      });
    });
  }

  /**
   * The memory section has the id 5. It decodes into a vector of memories that
   * represent the mems component of a module.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#memory-section
   */
  _writeMemorySection() {
    this._writeSection(0x05, () => {
      this._writeVec(this._memories, (memory) => {
        this._writeMemoryType(memory);
      });
    });
  }

  /**
   * Memory types are encoded with their limits.
   *
   * https://webassembly.github.io/spec/core/binary/types.html#memory-types
   */
  _writeMemoryType(memType: MemType) {
    this._writeLimits(memType);
  }

  /**
   * Limits are encoded with a preceding flag indicating whether a maximum is present.
   *
   * https://webassembly.github.io/spec/core/binary/types.html#limits
   */
  _writeLimits(limits: Limits) {
    const flag = limits.max == null ? 0x00 : 0x01;
    this._bytes.push(flag);
    this._writeU32(limits.min);
    if (limits.max != null) {
      this._writeU32(limits.max);
    }
  }

  /**
   * The global section has the id 6. It decodes into a vector of globals that
   * represent the  component of a module.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#global-section
   */
  _writeGlobalsSection() {
    this._writeSection(0x06, () => {
      this._writeVec(this._globals, (global) => this._writeGlobal(global));
    });
  }

  _writeGlobal(global: Global) {
    this._writeGlobalType(global.globalType);
    this._writeExpression(global.init);
  }

  _writeGlobalType(globalType: GlobalType) {
    this._writeValType(globalType.type);
    this._writeByte(globalType.mut);
  }

  /**
   * The export section has the id 7. It decodes into a vector of exports that
   * represent the  component of a module.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#export-section
   */
  _writeExportsSection() {
    this._writeSection(0x07, () => {
      this._writeVec(this._exports, (export_) => {
        this._writeExport(export_);
      });
    });
  }

  _writeExport(export_: Export) {
    this._writeName(export_.name);
    this._writeByte(export_.exportDesc);
    this._writeIndex(export_.index);
  }

  /**
   * Names are encoded as a vector of bytes containing the Unicode (Section 3.9)
   * UTF-8 encoding of the name’s character sequence.
   *
   * https://webassembly.github.io/spec/core/binary/values.html#names
   */
  _writeName(name: string) {
    this._writeVec(name.split(""), (char) => {
      this._writeByte(char.charCodeAt(0));
    });
  }

  /**
   * The code section has the id 10. It decodes into a vector of code entries
   * that are pairs of value type vectors and expressions. They represent the
   * locals and body field of the functions in the funcs component of a module.
   * The type fields of the respective functions are encoded separately in the
   * function section.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#code-section
   */
  _writeCodeSection() {
    this._writeSection(0x0a, () => {
      this._writeVec(this._code, (code) => {
        this._writeCode(code.getCode());
      });
    });
  }

  /**
   * The encoding of each code entry consists of
   * - the u32 size of the function code in bytes,
   * - the actual function code, which in turn consists of
   *   - the declaration of locals,
   *   - the function body as an expression.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#code-section
   */
  _writeCode(code: Code) {
    this._writeByteBlock(() => {
      this._writeLocalDeclarations(code.locals);
      this._writeExpression(code.expression);
    });
  }

  /**
   * Local declarations are compressed into a vector whose entries consist of
   * - a u32 count,
   * - a value type,
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#code-section
   */
  _writeLocalDeclarations(locals: LocalDeclaration[]) {
    this._writeVec(locals, (local) => {
      this._writeU32(local.count);
      this._writeValType(local.type);
    });
  }

  /**
   * Expressions are encoded by their instruction sequence terminated with an
   * explicit 0x0b opcode for end.
   */
  _writeExpression(expression: Expression) {
    for (const byte of expression) {
      this._writeByte(byte);
    }
    this._writeByte(0x0b);
  }

  /**
   * Function types are encoded by the byte 0x60 followed by the respective
   * vectors of parameter and result types.
   *
   * https://webassembly.github.io/spec/core/binary/types.html#function-types
   */
  _writeFunctionType(funcType: FuncType) {
    this._writeByte(0x60);
    this._writeResultType(funcType.params);
    this._writeResultType(funcType.results);
  }

  /**
   * Result types are encoded by the respective vectors of value types.
   *
   * https://webassembly.github.io/spec/core/binary/types.html#result-types
   */
  _writeResultType(resultType: ResultType) {
    this._writeVec(resultType, (valType) => {
      this._writeValType(valType);
    });
  }

  /**
   * Value types are encoded with their respective encoding as a number type,
   * vector type, or reference type.
   *
   * Note: All valtypes are encoded as a single byte, and we use the enum to
   * encode that byte.
   *
   * https://webassembly.github.io/spec/core/binary/types.html#value-types
   */
  _writeValType(valType: ValType) {
    this._writeByte(valType);
  }

  /**
   * All indices are encoded with their respective value.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#indices
   */
  _writeIndex(index: number) {
    this._writeU32(index);
  }

  /**
   * Vectors are encoded with their u32 length followed by the encoding of their
   * element sequence.
   *
   * https://webassembly.github.io/spec/core/binary/conventions.html#vectors
   */
  _writeVec<T>(elements: T[], fn: (element: T) => void) {
    this._writeU32(elements.length);
    for (const element of elements) {
      fn(element);
    }
  }

  /**
   * Write a u32
   */
  _writeU32(value: number) {
    Encoding.appendU32(this._bytes, value);
  }

  _writeByte(byte: number) {
    this._bytes.push(byte);
  }

  /**
   * Write a bounded sequence of bytes.
   *
   * NOTE: Do not call this by spreading a large array, or you will blow the
   * stack.
   */
  _writeBytes(...bytes: number[]) {
    for (let byte of bytes) {
      this._bytes.push(byte);
    }
  }

  /**
   * Each section consists of
   * - a one-byte section id,
   * - the u32 size of the contents, in bytes,
   * - the actual contents, whose structure is depended on the section id.
   *
   * Every section is optional; an omitted section is equivalent to the
   * section being present with empty contents.
   *
   * Note: Other than for unknown custom sections, the size is not required
   * for decoding, but can be used to skip sections when navigating through a
   * binary. The module is malformed if the size does not match the length of
   * the binary contents.
   *
   * https://webassembly.github.io/spec/core/binary/modules.html#sections
   */
  _writeSection(section: number, fn: () => void) {
    this._writeByte(section);
    this._writeByteBlock(fn);
  }

  /**
   * Helper function to write a block of bytes with a u32 length prefix.
   */
  _writeByteBlock(fn: () => void) {
    const start = this._bytes.length;
    fn();
    const end = this._bytes.length;
    const diff = end - start;
    const bytes = [];
    Encoding.appendU32(bytes, diff);
    this._bytes.splice(start, 0, ...bytes);
  }
}

/**
 * Class for building up a Wasm function.
 */
export class FunctionContext {
  _ctx: ModuleContext;
  exp: ExpressionContext;
  _locals: LocalDeclaration[] = [];
  _params: ValType[];
  _results: ValType[];

  constructor(ctx: ModuleContext, params: ValType[], results: ValType[]) {
    this._ctx = ctx;
    this._params = params;
    this._results = results;
    this.exp = new ExpressionContext();
  }

  defineLocal(type: ValType): number {
    const index = this._params.length + this._locals.length;
    // TODO: We could optimize this by combining locals of the same type
    this._locals.push({ count: 1, type });
    return index;
  }

  getCode(): Code {
    return {
      locals: this._locals,
      expression: this.exp._bytes,
    };
  }

  getFuncType(): FuncType {
    return {
      params: this._params,
      results: this._results,
    };
  }
}

export class ExpressionContext {
  _bytes: number[];
  constructor() {
    this._bytes = [];
  }

  /**
   * Control Instructions
   *
   * Control instructions have varying encodings. For structured instructions,
   * the instruction sequences forming nested blocks are terminated with
   * explicit opcodes for end and else.
   *
   * Block types are encoded in special compressed form, by either the byte 0x40
   * indicating the empty type, as a single value type, or as a type index
   * encoded as a positive signed integer.
   *
   * Note:
   *
   * The else opcode 0x05 in the encoding of an if instruction can be omitted if
   * the following instruction sequence is empty.
   *
   * Unlike any other occurrence, the type index in a block type is encoded as a
   * positive signed integer, so that its signed LEB128 bit pattern cannot
   * collide with the encoding of value types or the special code , which
   * correspond to the LEB128 encoding of negative integers. To avoid any loss
   * in the range of allowed indices, it is treated as a 33 bit signed integer.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#control-instructions
   */
  unreachable() {
    this._bytes.push(0x00);
  }
  nop() {
    this._bytes.push(0x01);
  }
  block() {
    this._bytes.push(0x02);
    throw new Error("Not implemented");
    this._bytes.push(0x0b);
  }
  loop() {
    throw new Error("Unimplemented");
  }
  /**
   * Expects the test condition (i32) to be on the stack, and will conditionally
   * evaluate the consequent block.
   */
  if(blockType: BlockType, consequent: (exp: ExpressionContext) => void) {
    this._bytes.push(0x04);
    this._writeBlockType(blockType);
    consequent(this);
    this._bytes.push(0x0b);
  }
  _writeBlockType(blockType: BlockType) {
    switch (blockType.kind) {
      case "EMPTY":
        this._bytes.push(0x40);
        break;
      case "VALUE":
        // TODO: Ideally this would use _writeValType
        this._bytes.push(blockType.valType);
        break;
      default:
        throw new Error(`Unexpected block type: ${blockType}`);
    }
  }
  ifElse() {
    throw new Error("Unimplemented");
  }
  br() {
    throw new Error("Unimplemented");
  }
  brIf() {
    throw new Error("Unimplemented");
  }
  brTable() {
    throw new Error("Unimplemented");
  }
  return() {
    this._bytes.push(0x0f);
  }
  call(index: number) {
    this._bytes.push(0x10);
    this._writeU32(index);
  }
  callIndirect() {
    throw new Error("Unimplemented");
  }

  /**
   * Reference Instructions
   *
   * Reference instructions are represented by single byte codes.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#reference-instructions
   */

  // TODO

  /**
   * Parametric Instructions
   *
   * Parametric instructions are represented by single byte codes, possibly followed by a type annotation.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#parametric-instructions
   */

  drop() {
    this._bytes.push(0x1a);
  }
  /**
   * The select instruction selects one of its first two operands based on
   * whether its third operand is zero or not. It may include a value type
   * determining the type of these operands. If missing, the operands must be of
   * numeric type.
   *
   * Note: In future versions of WebAssembly, the type annotation on  may allow
   * for more than a single value being selected at the same time.
   */
  select(t?: ValType[]) {
    this._bytes.push(0x1b);
    if (t != null) {
      // TODO: Need to support _writeVec on this class.
      throw new Error("Select return types are not yet supported.");
    }
  }

  /**
   * Variable Instructions
   *
   * Variable instructions are concerned with access to local or global variables.
   *
   * These instructions get or set the values of variables, respectively. The local.tee
   * instruction is like local.set but also returns its argument.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#variable-instructions
   */
  localGet(index: number) {
    this._bytes.push(0x20);
    this._writeU32(index);
  }
  localSet(index: number) {
    this._bytes.push(0x21);
    this._writeU32(index);
  }
  localTee(index: number) {
    this._bytes.push(0x22);
    this._writeU32(index);
  }
  globalGet(index: number) {
    this._bytes.push(0x23);
    this._writeU32(index);
  }
  globalSet(index: number) {
    this._bytes.push(0x24);
    // TODO: We could ensure the global is mutable here.
    this._writeU32(index);
  }

  /**
   * Table Instructions
   *
   * Table instructions are represented either by a single byte or a one byte
   * prefix followed by a variable-length unsigned integer.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#table-instructions
   */

  // TODO

  /**
   * Memory Instructions
   *
   * Each variant of memory instruction is encoded with a different byte code.
   * Loads and stores are followed by the encoding of their memarg immediate.
   *
   * Note:
   *
   * In future versions of WebAssembly, the additional zero bytes occurring in
   * the encoding of the memory.size, memory.grow, memory.copy, and memory.fill
   * instructions may be used to index additional memories.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#memory-instructions
   */

  i32Load(offset: number, align: number) {
    this._bytes.push(0x28);
    this._writeMemArg(offset, align);
  }

  // TODO...

  i32Store(offset: number, align: number) {
    this._bytes.push(0x36);
    this._writeMemArg(offset, align);
  }

  // TODO...

  /**
   * The memory.size instruction returns the current size of a memory.
   */
  memorySize() {
    this._bytes.push(0x3f);
    this._bytes.push(0x00); // Memory index. Always 0 in current version of WebAssembly.
  }

  /**
   * The memory.grow instruction grows memory by a given delta and returns the
   * previous size, or -1 if enough memory cannot be allocated. Both instructions
   * operate in units of page size.
   */
  memoryGrow() {
    this._bytes.push(0x40);
    this._bytes.push(0x00); // Memory index. Always 0 in current version of WebAssembly.
  }
  /**
   * MemArg ::= align:u32 offset:u32
   */
  _writeMemArg(offset: number, align: number) {
    this._writeU32(align);
    this._writeU32(offset);
  }

  /**
   * Numeric Instructions
   *
   * All variants of numeric instructions are represented by separate byte
   * codes.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#numeric-instructions
   */

  i32EqZ() {
    this._bytes.push(0x45);
  }
  i32Eq() {
    this._bytes.push(0x46);
  }
  i32Ne() {
    this._bytes.push(0x47);
  }
  i32LtS() {
    this._bytes.push(0x48);
  }
  i32LtU() {
    this._bytes.push(0x49);
  }
  i32GtS() {
    this._bytes.push(0x4a);
  }
  i32GtU() {
    this._bytes.push(0x4b);
  }
  i32LeS() {
    this._bytes.push(0x4c);
  }
  i32LeU() {
    this._bytes.push(0x4d);
  }
  i32GeS() {
    this._bytes.push(0x4e);
  }
  i32GeU() {
    this._bytes.push(0x4f);
  }
  i64EqZ() {
    this._bytes.push(0x50);
  }
  i64Eq() {
    this._bytes.push(0x51);
  }
  i64Ne() {
    this._bytes.push(0x52);
  }
  i64LtS() {
    this._bytes.push(0x53);
  }
  i64LtU() {
    this._bytes.push(0x54);
  }
  i64GtS() {
    this._bytes.push(0x55);
  }
  i64GtU() {
    this._bytes.push(0x56);
  }
  i64LeS() {
    this._bytes.push(0x57);
  }
  i64LeU() {
    this._bytes.push(0x58);
  }
  i64GeS() {
    this._bytes.push(0x59);
  }
  i64GeU() {
    this._bytes.push(0x5a);
  }

  f64Eq() {
    this._bytes.push(0x5b);
  }

  /**
   * The const instructions are followed by the respective literal.
   */
  i32Const(n: number) {
    this._bytes.push(0x41);
    this._writeI32(n);
  }
  i64Const(n: number) {
    this._bytes.push(0x42);
    throw new Error("Unimplemented");
  }
  f32Const(n: number) {
    this._bytes.push(0x43);
    throw new Error("Unimplemented");
  }
  f64Const(n: number) {
    this._bytes.push(0x44);
    this._writeF64(n);
  }

  /**
   * All other numeric instructions are plain opcodes without any immediates.
   */

  i32Clz() {
    this._bytes.push(0x67);
  }
  i32Ctz() {
    this._bytes.push(0x68);
  }
  i32PopCnt() {
    this._bytes.push(0x69);
  }
  i32Add() {
    this._bytes.push(0x6a);
  }
  i32Sub() {
    this._bytes.push(0x6b);
  }
  i32Mul() {
    this._bytes.push(0x6c);
  }
  i32DivS() {
    this._bytes.push(0x6d);
  }
  i32DivU() {
    this._bytes.push(0x6e);
  }
  i32RemS() {
    this._bytes.push(0x6f);
  }
  i32RemU() {
    this._bytes.push(0x70);
  }
  i32And() {
    this._bytes.push(0x71);
  }
  i32Or() {
    this._bytes.push(0x72);
  }
  i32Xor() {
    this._bytes.push(0x73);
  }
  i32Shl() {
    this._bytes.push(0x74);
  }
  i32ShrS() {
    this._bytes.push(0x75);
  }
  i32ShrU() {
    this._bytes.push(0x76);
  }
  i32Rotl() {
    this._bytes.push(0x77);
  }
  i32Rotr() {
    this._bytes.push(0x78);
  }

  // TODO

  f64Abs() {
    this._bytes.push(0x99);
  }
  f64Neg() {
    this._bytes.push(0x9a);
  }
  f64Ceil() {
    this._bytes.push(0x9b);
  }
  f64Floor() {
    this._bytes.push(0x9c);
  }
  f64Trunc() {
    this._bytes.push(0x9d);
  }
  f64Nearest() {
    this._bytes.push(0x9e);
  }
  f64Sqrt() {
    this._bytes.push(0x9f);
  }
  f64Add() {
    this._bytes.push(0xa0);
  }
  f64Sub() {
    this._bytes.push(0xa1);
  }
  f64Mul() {
    this._bytes.push(0xa2);
  }
  f64Div() {
    this._bytes.push(0xa3);
  }
  f64Min() {
    this._bytes.push(0xa4);
  }
  f64Max() {
    this._bytes.push(0xa5);
  }
  f64CopySign() {
    this._bytes.push(0xa6);
  }

  // TODO

  i32TruncF64S() {
    this._bytes.push(0xaa);
  }

  // TODO

  /**
   * The saturating truncation instructions all have a one byte prefix, whereas
   * the actual opcode is encoded by a variable-length unsigned integer.
   */

  // TODO

  /**
   * Vector Instructions
   *
   * All variants of vector instructions are represented by separate byte codes.
   * They all have a one byte prefix, whereas the actual opcode is encoded by a
   * variable-length unsigned integer.
   *
   * Vector loads and stores are followed by the encoding of their memarg
   * immediate.
   *
   * https://webassembly.github.io/spec/core/binary/instructions.html#vector-instructions
   */

  // TODO

  _writeU32(n: number) {
    Encoding.appendU32(this._bytes, n);
  }

  _writeI32(n: number) {
    Encoding.appendI32(this._bytes, n);
  }

  _writeF64(n: number) {
    Encoding.appendF64(this._bytes, n);
  }
}

function funcTypesAreEqual(a: FuncType, b: FuncType) {
  return (
    resultTypesAreEqual(a.results, b.results) &&
    resultTypesAreEqual(a.params, b.params)
  );
}

function resultTypesAreEqual(a: ResultType, b: ResultType): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
