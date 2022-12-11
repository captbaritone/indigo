export type SymbolType =
  | {
      type: "bool";
    }
  | {
      type: "nil";
    }
  | {
      type: "f64";
    }
  | {
      type: "i32";
    }
  | {
      type: "empty";
    }
  | FunctionSymbol
  | EnumSymbol;

type FunctionSymbol = {
  type: "function";
  params: SymbolType[];
  result: SymbolType;
  scope: SymbolTable;
};

type EnumSymbol = {
  type: "enum";
  variants: { name: string; valueType: SymbolType | null }[];
};

export default class SymbolTable {
  _variables: Map<string, SymbolType> = new Map();
  _parent: SymbolTable | null = null;

  constructor(parent: SymbolTable | null = null) {
    this._parent = parent;
  }

  define(name: string, type: SymbolType) {
    this._variables.set(name, type);
  }

  lookup(name: string): SymbolType | null {
    const found = this._variables.get(name);
    if (found != null) {
      return found;
    }
    if (this._parent != null) {
      return this._parent.lookup(name);
    }
    return null;
  }

  lookupFunction(name: string): FunctionSymbol {
    return this.lookup(name) as FunctionSymbol;
  }
  lookupEnum(name: string): EnumSymbol {
    return this.lookup(name) as EnumSymbol;
  }

  child(): SymbolTable {
    return new SymbolTable(this);
  }
}
