import * as Parser from "./Parser";
import { typeCheck } from "./TypeChecker";
import * as Emitter from "./WasmEmitter";
import { ModuleContext } from "../..";

export default function compile(source: string): Uint8Array {
  const ast = Parser.parse(source);
  const typeTable = typeCheck(ast);
  const ctx = new ModuleContext();
  Emitter.emit(ctx, ast, typeTable);
  return ctx.compile();
}
