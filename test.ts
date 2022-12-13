import test from "node:test";
import { strict as assert } from "node:assert";

import { ExpressionContext, ModuleContext } from ".";
import { Mut, NumType } from "./types";

test("Echo", async (t) => {
  const context = new ModuleContext();
  const funcIndex = context.declareFunction({
    params: [NumType.I32],
    results: [NumType.I32],
  });
  context.defineFunction(funcIndex, (func) => {
    func.exp.localGet(0);
  });
  context.exportFunction("echo", funcIndex);

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.echo(1), 1);
});

test("Add", async (t) => {
  const context = new ModuleContext();
  const funcIndex = context.declareFunction({
    params: [NumType.I32, NumType.I32],
    results: [NumType.I32],
  });
  context.exportFunction("add", funcIndex);
  context.defineFunction(funcIndex, ({ exp }) => {
    exp.localGet(0);
    exp.localGet(1);
    exp.i32Add();
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.add(1, 2), 3);
});

test("Function call", async (t) => {
  const context = new ModuleContext();
  const functionIndex = context.declareFunction({
    params: [],
    results: [NumType.I32],
  });

  context.defineFunction(functionIndex, ({ exp }) => {
    exp.i32Const(10);
  });

  const otherFunctionIndex = context.declareFunction({
    params: [NumType.I32, NumType.I32],
    results: [NumType.I32],
  });

  context.exportFunction("twenty", otherFunctionIndex);

  context.defineFunction(otherFunctionIndex, ({ exp }) => {
    exp.call(functionIndex);
    exp.call(functionIndex);
    exp.i32Add();
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.twenty(), 20);
});

test("Global", async (t) => {
  const context = new ModuleContext();
  const globalIndex = context.declareGlobal({
    globalType: {
      type: NumType.I32,
      mut: Mut.VAR,
    },
    init: [0x41, 1],
  });
  const getGIndex = context.declareFunction({
    params: [],
    results: [NumType.I32],
  });
  context.exportFunction("getG", getGIndex);
  context.defineFunction(getGIndex, ({ exp }) => {
    exp.globalGet(globalIndex);
    exp.i32Const(1);
    exp.i32Add();
    exp.globalSet(globalIndex);
    exp.globalGet(globalIndex);
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.getG(), 2);
  // @ts-ignore
  assert.equal(instance.exports.getG(), 3);
});

test("Tiny compiler", async () => {
  const ctx = new ModuleContext();
  const functionIndex = ctx.declareFunction({
    params: [],
    results: [NumType.I32],
  });

  ctx.exportFunction("run", functionIndex);

  const ast = {
    type: "add",
    left: { type: "num", value: 6 },
    right: {
      type: "sub",
      left: { type: "num", value: 10 },
      right: { type: "num", value: 12 },
    },
  };

  ctx.defineFunction(functionIndex, ({ exp }) => {
    compile(exp, ast);
  });

  const instance = await ctx.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.run(), 4);
});

// A tiny compiler
function compile(exp: ExpressionContext, node: any) {
  switch (node.type) {
    case "num":
      // @ts-ignore
      exp.i32Const(node.value);
      break;
    case "add":
      compile(exp, node.left);
      compile(exp, node.right);
      // @ts-ignore
      exp.i32Add();
      break;
    case "sub":
      compile(exp, node.left);
      compile(exp, node.right);
      // @ts-ignore
      exp.i32Sub();
      break;
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}
