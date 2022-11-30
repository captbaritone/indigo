import {
  FuncType,
  NumType,
  ResultType,
  ValType,
  Export,
  ExportDesc,
  Code,
  LocalDeclaration,
  Expression,
} from "./types";

type FunctionDeclaration = {
  name: string;
  params: { [name: string]: ValType };
  results: ValType[];
  export: boolean;
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

  declareFunction(func: FunctionDeclaration): FunctionContext {
    const nextFuncTypeIndex = this._funcTypes.length;
    const functionContext = new FunctionContext(func.params, func.results);
    this._funcTypes.push(functionContext.getFuncType());
    const nextFuncIndex = this._functions.length;
    this._functions.push(nextFuncTypeIndex);

    // TODO: What about export order? I think exports need to come first?
    if (func.export) {
      this._exports.push({
        name: func.name,
        exportDesc: ExportDesc.FUNC_IDX,
        index: nextFuncIndex,
      });
    }
    this._code.push(functionContext);
    return functionContext;
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

    this._writeTypesSection(); // Required

    this._writeImportsSection();
    this._writeFunctionsSection(); // Required
    this._writeMemoriesSection();
    this._writeGlobalsSection();

    this._writeExportsSection(); // Required
    // TODO: Start section
    // TODO: Element section
    this._writeCodeSection(); // Required
    return new Uint8Array(this._bytes);
  }

  async getModule(): Promise<WebAssembly.Module> {
    const bytes = this.compile();
    return await WebAssembly.compile(bytes);
  }

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
    this._writeSection(1, () => {
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

  _writeMemoriesSection() {}

  _writeGlobalsSection() {}

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
   *
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
    this._writeBytes(...encodeU32(value));
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
    this._bytes.splice(start, 0, ...encodeU32(diff));
  }
}

/**
 * Class for building up a Wasm function.
 */
export class FunctionContext {
  _locals: LocalDeclaration[] = [];
  _bytes: number[] = [];
  _params: ValType[];
  _results: ValType[];
  _variables: { [name: string]: number } = {};

  constructor(params: { [name: string]: ValType }, results: ValType[]) {
    this._params = Object.values(params);
    this._results = results;
    const paramNames = Object.keys(params);
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      this._variables[paramName] = i;
    }
  }

  // Wrapper around local.get which accepts a named variable.
  localGet(name: string) {
    this._bytes.push(0x20);
    const index = this._variables[name];
    if (index == null) {
      throw new Error(`Unknown variable ${name}`);
    }
    this._bytes.push(...encodeU32(index));
  }

  i32Const(n: number) {
    this._bytes.push(0x41);
    this._bytes.push(...encodeI32(n));
  }
  i32Add() {
    this._bytes.push(0x6a);
  }

  defineLocal(name: string, type: ValType) {
    if (this._variables.hasOwnProperty(name)) {
      throw new Error(`Variable "${name} is already defined`);
    }
    this._variables[name] = Object.keys(this._variables).length;

    // TODO: We could optimize this by combining locals of the same type
    this._locals.push({ count: 1, type });
  }

  getCode(): Code {
    return {
      locals: this._locals,
      expression: this._bytes,
    };
  }

  getFuncType(): FuncType {
    return {
      params: this._params,
      results: this._results,
    };
  }
}

function encodeU32(n: number): number[] {
  const buffer: number[] = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    buffer.push(byte);
  } while (n !== 0);
  return buffer;
}

function encodeI32(value: number): number[] {
  // TODO: Guard
  let bytes: number[] = [];
  let byte = 0x00;
  let size = Math.ceil(Math.log2(Math.abs(value)));
  let negative = value < 0;
  let more = true;

  while (more) {
    byte = value & 127;
    value = value >> 7;

    if (negative) {
      value = value | -(1 << (size - 7));
    }

    if (
      (value == 0 && (byte & 0x40) == 0) ||
      (value == -1 && (byte & 0x40) == 0x40)
    ) {
      more = false;
    } else {
      byte = byte | 128;
    }

    bytes.push(byte);
  }
  return bytes;
}
