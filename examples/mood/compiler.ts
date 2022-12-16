import * as Parser from "./Parser";
import { typeCheck } from "./TypeChecker";
import * as Emitter from "./WasmEmitter";
import { Result, catchToResult } from "./DiagnosticError";
import { ModuleContext } from "../..";
import { computeLayout } from "./MemoryLayout";

export default function compile(source: string): Result<Uint8Array> {
  return catchToResult(() => compileImpl(source));
}

function compileImpl(source: string): Uint8Array {
  const ast = Parser.parse(source);
  const typeTable = typeCheck(ast);
  const stackSizes = computeLayout(ast, typeTable);
  const ctx = new ModuleContext();
  Emitter.emit(ctx, ast, typeTable, stackSizes);
  return ctx.compile();
}
