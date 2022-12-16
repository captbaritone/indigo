import { AstNode } from "./ast";
import { SymbolType } from "./SymbolTable";
import TypeTable from "./TypeTable";

export type StackSizes = Map<number, number>;

export function computeLayout(node: AstNode, typeTable: TypeTable): StackSizes {
  const layout = new MemoryLayout(typeTable);
  layout.measure(node);
  return layout._stackSizes;
}

/**
 * Computes the memory layout of each stack frame. This is used to answer
 */
class MemoryLayout {
  _typeTable: TypeTable;
  _stackSizes: StackSizes = new Map();
  constructor(typeTable: TypeTable) {
    this._typeTable = typeTable;
  }

  measureAll(nodes: AstNode[]): number {
    let size = 0;
    for (const node of nodes) {
      size += this.measure(node);
    }
    return size;
  }

  measure(node: AstNode): number {
    switch (node.type) {
      case "Program":
        return this.measureAll(node.body);
      case "EnumDeclaration":
      case "StructDeclaration":
        return 0;
      case "FunctionDeclaration": {
        const stackSize = this.measure(node.body);
        this._stackSizes.set(node.nodeId, stackSize);
        return stackSize;
      }
      case "Parameter":
        return this.sizeOfId(node.annotation.nodeId);
      case "BlockExpression":
        return this.measureAll(node.expressions);
      case "VariableDeclaration":
        return this.sizeOfId(node.annotation.nodeId);
      case "CallExpression":
      case "MemberExpression":
      case "ExpressionPath":
      case "Literal":
      case "Identifier":
      case "StructConstruction":
        return this.sizeOfId(node.nodeId);
      case "BinaryExpression":
        return this.measure(node.left) + this.measure(node.right);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  sizeOfId(nodeId: number) {
    const type = this._typeTable.lookup(nodeId);
    return this.sizeOf(type);
  }

  // Returns the size of the given type in bytes.
  sizeOf(t: SymbolType): number {
    const type = t.type;
    switch (type) {
      case "bool":
      case "i32":
        return 4;
      case "f64":
        return 8;
      case "function":
      case "nil":
      case "empty":
        throw new Error(`TODO: Implement sizeOf for ${type}`);
      case "enum": {
        let size = 0;
        for (const variant of t.variants) {
          if (variant.valueType != null) {
            size = Math.max(size, this.sizeOf(variant.valueType));
          }
        }
        // Largest variant + 4 bytes for the tag
        return size + 4;
      }
      case "struct":
        let size = 0;
        for (const field of t.fields) {
          size += this.sizeOf(field.valueType);
        }
        return size;
      default:
        const exhausitve: never = type;
        throw new Error(`Unknown type: ${type}`);
    }
  }
}
