import test from "node:test";
import { strict as assert } from 'node:assert';

import { CompilerContext } from ".";

test("Hello world", (t) => {
  const context = new CompilerContext();

  const actual = context.compile();
  assert.deepEqual(Array.from(actual), []);
});
