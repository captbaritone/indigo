import test from "node:test";
import { strict as assert } from "node:assert";

import { ModuleContext } from ".";
import { NumType } from "./types";

test("Echo", async (t) => {
  const context = new ModuleContext();
  const func = context.declareFunction({
    params: { input: NumType.I32 },
    results: [NumType.I32],
    name: "echo",
    export: true,
  });

  func.localGet("input");

  const instance = await context.getInstance();
  assert.equal(instance.exports.echo(1), 1);
});

test("Add", async (t) => {
  const context = new ModuleContext();
  const func = context.declareFunction({
    params: { a: NumType.I32, b: NumType.I32 },
    results: [NumType.I32],
    name: "add",
    export: true,
  });

  func.localGet("a");
  func.localGet("b");
  func.i32Add();

  const instance = await context.getInstance();
  assert.equal(instance.exports.add(1, 2), 3);
});

test("Tiny compiler", async () => {
  const ctx = new ModuleContext();
  const func = ctx.declareFunction({
    name: "run",
    params: {},
    results: [NumType.I32],
    export: true,
  });

  function compile(node: any) {
    switch (node.type) {
      case "num":
        func.i32Const(node.value);
        break;
      case "add":
        compile(node.left);
        compile(node.right);
        func.i32Add();
        break;
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  compile({
    type: "add",
    left: { type: "num", value: 1 },
    right: { type: "num", value: 2 },
  });

  const instance = await ctx.getInstance();
  assert.equal(instance.exports.run(), 3);
});
