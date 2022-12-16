import { SymbolType } from "./SymbolTable";

/**
 * Some AST nodes include a `nodeId` field which is a unique identifiers for the
 * node. Typechecking populates a TypeTable with the type of each such AST node.
 *
 * Note that this is different than the SymbolTable, which tracks scope and only
 * defines type information for identifiers. The TypeTable is simpler in that it
 * is a flat list which has scopes already resolved.
 *
 * In other words, the SymbolTable is used during typechecking as a tool to help
 * populate the TypeTable.
 */
export default class TypeTable {
  _astNodes: SymbolType[] = [];

  define(nodeId: number, type: SymbolType): SymbolType {
    this._astNodes[nodeId] = type;
    return type;
  }
  lookup(nodeId: number): SymbolType {
    const type = this._astNodes[nodeId];
    if (type == null) {
      throw new Error(`No type for AST node ${nodeId}`);
    }
    return type;
  }
}
