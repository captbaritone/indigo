/**
 * Number types are encoded by a single byte.
 *
 * https://webassembly.github.io/spec/core/binary/types.html#number-types
 */
export enum NumType {
  I32 = 0x7f,
  I64 = 0x7e,
  F32 = 0x7d,
  F64 = 0x7c,
}
/**
 * Vector types are also encoded by a single byte.
 *
 * https://webassembly.github.io/spec/core/binary/types.html#vector-types
 */
export enum VecType {
  V128 = 0x7b,
}

/**
 * Reference types are also encoded by a single byte.
 *
 * https://webassembly.github.io/spec/core/binary/types.html#reference-types
 */
export enum RefType {
  FUNC_REF = 0x70,
  EXTERN_REF = 0x6f,
}

/**
 * https://webassembly.github.io/spec/core/binary/types.html#value-types
 */
export type ValType = NumType | VecType | RefType;

/**
 * https://webassembly.github.io/spec/core/binary/types.html#result-types
 */
export type ResultType = ValType[];

/**
 * The min size in the limits of the memory type specifies the initial size of that
 * memory, while its max, if present, restricts the size to which it can grow
 * later. Both are in units of page size.
 */
export type MemType = Limits;

export type Limits = {
  min: number;
  max?: number;
};

// TODO: Consider renaming since there's a global type by this name
export type Global = { name: string; globalType: GlobalType; init: Expression };

export enum Mut {
  CONST = 0x00,
  VAR = 0x01,
}

export type GlobalType = {
  type: ValType;
  mut: Mut;
};

/**
 * https://webassembly.github.io/spec/core/binary/types.html#function-types
 */
export type FuncType = {
  params: ResultType;
  results: ResultType;
};

export type Export = {
  name: string;
  exportDesc: ExportDesc;
  index: number; // funcidx | tableidx | memidx | globalidx
};

export enum ExportDesc {
  FUNC_IDX = 0x00,
  TABLE_IDX = 0x01,
  MEM_IDX = 0x02,
  GLOBAL_IDX = 0x03,
}

export type LocalDeclaration = {
  count: number;
  type: ValType;
};

export type Code = {
  locals: LocalDeclaration[];
  expression: Expression;
};

export type Expression = number[];

export type BlockType =
  | {
      kind: "EMPTY";
    }
  | {
      kind: "VALUE";
      valType: ValType;
    }
  | {
      kind: "FUNC_TYPE";
      funcType: FuncType;
    };
// TODO: We could do func type by name. Do people actually want to use existing
// function types, or do they just want to use this type shape to define block
// types that have noting to do with functions? I suspect the latter.
