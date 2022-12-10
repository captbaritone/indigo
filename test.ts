import test from "node:test";
import { strict as assert } from "node:assert";

import { FunctionContext, ModuleContext } from ".";
import { Mut, NumType } from "./types";

test("Echo", async (t) => {
  const context = new ModuleContext();
  context.declareFunction({
    params: { input: NumType.I32 },
    results: [NumType.I32],
    name: "echo",
    export: true,
  });
  context.defineFunction("echo", (exp) => {
    exp.localGet("input");
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.echo(1), 1);
});

test("Add", async (t) => {
  const context = new ModuleContext();
  context.declareFunction({
    params: { a: NumType.I32, b: NumType.I32 },
    results: [NumType.I32],
    name: "add",
    export: true,
  });
  context.defineFunction("add", (exp) => {
    exp.localGet("a");
    exp.localGet("b");
    exp.i32Add();
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.add(1, 2), 3);
});

test("Function call", async (t) => {
  const context = new ModuleContext();
  context.declareFunction({
    params: {},
    results: [NumType.I32],
    name: "ten",
    export: false,
  });

  context.defineFunction("ten", (exp) => {
    exp.i32Const(10);
  });

  context.declareFunction({
    params: { a: NumType.I32, b: NumType.I32 },
    results: [NumType.I32],
    name: "twenty",
    export: true,
  });
  context.defineFunction("twenty", (exp) => {
    exp.call("ten");
    exp.call("ten");
    exp.i32Add();
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.twenty(), 20);
});

test("Global", async (t) => {
  const context = new ModuleContext();
  context.declareGlobal({
    name: "g",
    globalType: {
      type: NumType.I32,
      mut: Mut.VAR,
    },
    init: [0x41, 1],
  });
  const getG = context.declareFunction({
    params: {},
    results: [NumType.I32],
    name: "getG",
    export: true,
  });
  context.defineFunction("getG", (exp) => {
    exp.globalGet("g");
    exp.i32Const(1);
    exp.i32Add();
    exp.globalSet("g");
    exp.globalGet("g");
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.getG(), 2);
  // @ts-ignore
  assert.equal(instance.exports.getG(), 3);
});

test("Tiny compiler", async () => {
  const ctx = new ModuleContext();
  ctx.declareFunction({
    name: "run",
    params: {},
    results: [NumType.I32],
    export: true,
  });

  const ast = {
    type: "add",
    left: { type: "num", value: 6 },
    right: {
      type: "sub",
      left: { type: "num", value: 10 },
      right: { type: "num", value: 12 },
    },
  };

  ctx.defineFunction("run", (exp) => {
    // @ts-ignore
    compile(exp, ast);
  });

  const instance = await ctx.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.run(), 4);
});

// A tiny compiler
function compile(exp: FunctionContext, node: any) {
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
