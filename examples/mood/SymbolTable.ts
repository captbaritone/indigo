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

/**
 * A symbol table is a mapping from names to types. It models the scopes of Mood
 * by having an optional parent scope. If a type is not found in the current
 * scope, it will be looked up in the parent scope(s).
 *
 * This allows variable shadowing where a variable in a child scope, such as a
 * function body, can have the same name as a different variable in the parent
 * scope.
 */
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

  child(): SymbolTable {
    return new SymbolTable(this);
  }
}
