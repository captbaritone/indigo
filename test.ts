import test from "node:test";
import { strict as assert } from "node:assert";

import { ExpressionContext, ModuleContext } from ".";
import { Mut, NumType } from "./types";

test("Echo", async (t) => {
  const context = new ModuleContext();
  const funcIndex = context.declareFunction(
    { params: [NumType.I32], results: [NumType.I32] },
    (func) => {
      func.exp.localGet(0);
    },
  );
  context.exportFunction("echo", funcIndex);

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.echo(1), 1);
});

test("Add", async (t) => {
  const context = new ModuleContext();
  const funcIndex = context.declareFunction(
    { params: [NumType.I32, NumType.I32], results: [NumType.I32] },
    ({ exp }) => {
      exp.localGet(0);
      exp.localGet(1);
      exp.i32Add();
    },
  );
  context.exportFunction("add", funcIndex);

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.add(1, 2), 3);
});

test("Function call", async (t) => {
  const context = new ModuleContext();
  const functionIndex = context.declareFunction(
    { params: [], results: [NumType.I32] },
    ({ exp }) => {
      exp.i32Const(10);
    },
  );

  const otherFunctionIndex = context.declareFunction(
    { params: [NumType.I32, NumType.I32], results: [NumType.I32] },
    ({ exp }) => {
      exp.call(functionIndex);
      exp.call(functionIndex);
      exp.i32Add();
    },
  );

  context.exportFunction("twenty", otherFunctionIndex);

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.twenty(), 20);
});

test("Global", async (t) => {
  const context = new ModuleContext();
  const globalIndex = context.declareGlobal(
    { type: NumType.I32, mut: Mut.VAR },
    (init) => {
      init.i32Const(1);
    },
  );
  const getGIndex = context.declareFunction(
    { params: [], results: [NumType.I32] },
    ({ exp }) => {
      exp.globalGet(globalIndex);
      exp.i32Const(1);
      exp.i32Add();
      exp.globalSet(globalIndex);
      exp.globalGet(globalIndex);
    },
  );
  context.exportFunction("getG", getGIndex);

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.getG(), 2);
  // @ts-ignore
  assert.equal(instance.exports.getG(), 3);
});

test("Tiny compiler", async () => {
  const ctx = new ModuleContext();
  const ast = {
    type: "add",
    left: { type: "num", value: 6 },
    right: {
      type: "sub",
      left: { type: "num", value: 10 },
      right: { type: "num", value: 12 },
    },
  };
  const functionIndex = ctx.declareFunction(
    { params: [], results: [NumType.I32] },
    ({ exp }) => {
      compile(exp, ast);
    },
  );

  ctx.exportFunction("run", functionIndex);

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
