import test from "node:test";
import { strict as assert } from "node:assert";

import { ExpressionContext, ModuleContext } from ".";
import { Mut, NumType } from "./types";

test("Echo", async (t) => {
  const context = new ModuleContext();
  context.declareFunction(
    { params: [NumType.I32], results: [NumType.I32], exportName: "echo" },
    (func) => {
      func.exp.localGet(0);
    },
  );

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.echo(1), 1);
});

test("Add", async (t) => {
  const context = new ModuleContext();

  const signature = {
    params: [NumType.I32, NumType.I32],
    results: [NumType.I32],
    exportName: "add",
  };
  context.declareFunction(signature, ({ exp }) => {
    exp.localGet(0);
    exp.localGet(1);
    exp.i32Add();
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.add(1, 2), 3);
});

test("Global export with multiple returns", async (t) => {
  const context = new ModuleContext();

  const signature = {
    params: [NumType.I32, NumType.I32],
    results: [NumType.I32, NumType.I32],
    exportName: "echoTwice",
  };
  context.declareFunction(signature, ({ exp }) => {
    exp.localGet(0);
    exp.localGet(1);
  });

  const instance = await context.getInstance();
  // @ts-ignore
  assert.deepEqual(instance.exports.echoTwice(1, 2), [1, 2]);
});

test("Function call", async (t) => {
  const context = new ModuleContext();
  const functionIndex = context.declareFunction(
    { params: [], results: [NumType.I32] },
    ({ exp }) => {
      exp.i32Const(10);
    },
  );

  const signature = {
    params: [NumType.I32, NumType.I32],
    results: [NumType.I32],
    exportName: "twenty",
  };

  context.declareFunction(signature, ({ exp }) => {
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
  const globalIndex = context.declareGlobal(
    { type: NumType.I32, mut: Mut.VAR },
    (init) => {
      init.i32Const(1);
    },
  );
  context.declareFunction(
    { params: [], results: [NumType.I32], exportName: "getG" },
    ({ exp }) => {
      exp.globalGet(globalIndex);
      exp.i32Const(1);
      exp.i32Add();
      exp.globalSet(globalIndex);
      exp.globalGet(globalIndex);
    },
  );

  const instance = await context.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.getG(), 2);
  // @ts-ignore
  assert.equal(instance.exports.getG(), 3);
});

test("Tiny compiler", async () => {
  // A tiny compiler
  function compile(exp: ExpressionContext, node: any) {
    switch (node.type) {
      case "num":
        exp.i32Const(node.value);
        break;
      case "add":
        compile(exp, node.left);
        compile(exp, node.right);
        exp.i32Add();
        break;
      case "sub":
        compile(exp, node.left);
        compile(exp, node.right);
        exp.i32Sub();
        break;
    }
  }

  const ast = {
    type: "add",
    left: { type: "num", value: 6 },
    right: {
      type: "sub",
      left: { type: "num", value: 10 },
      right: { type: "num", value: 12 },
    },
  };

  const ctx = new ModuleContext();

  ctx.declareFunction(
    { params: [], results: [NumType.I32], exportName: "run" },
    ({ exp }) => compile(exp, ast),
  );

  const instance = await ctx.getInstance();
  // @ts-ignore
  assert.equal(instance.exports.run(), 4);
});
