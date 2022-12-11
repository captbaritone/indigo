import * as Parser from "./Parser";
import { typeCheck } from "./TypeChecker";
import * as Emitter from "./WasmEmitter";
import { Result, catchToResult } from "./DiagnosticError";
import { ModuleContext } from "../..";

export default function compile(source: string): Result<Uint8Array> {
  return catchToResult(() => compileImpl(source));
}

function compileImpl(source: string): Uint8Array {
  const ast = Parser.parse(source);
  const scope = typeCheck(ast);
  const ctx = new ModuleContext();
  Emitter.emit(ctx, ast, scope);
  return ctx.compile();
}
