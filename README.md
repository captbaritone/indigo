# Indigo

Indigo (codename, to be renamed before release) is a light-weight TypeScript
module that makes it easy to construct binary WebAssembly modules from
TypeScript. It's intended for use cases where you are comfortable writing raw
Wasm instructions, but 

- Provides type safety for WebAssembly instructions
- Binary encoding of instructions/values
- Juggling variable/function/global indexes
- Module encoding/structure

Indigo is intended for use cases such as just-in-time compilation (JIT), where
the Wasm module is constructed at runtime. For example, if you want to provide a
user-accessible domain specific language (DSL) for your users which compiles to
Wasm.

## Examples

Imperatively construct a Wasm module that adds two numbers:

```ts
import {ModuleContext, NumType} from "indigo";

const ctx = new ModuleContext();
const func = ctx.declareFunction({
  name: "add",
  params: { a: NumType.I32, b: NumType.I32 },
  results: [NumType.I32],
  export: true,
});

func.localGet("a");
func.localGet("b");
func.i32Add();

const instance = await context.getInstance();
assert.equal(instance.exports.add(1, 2), 3);
```

A simple compiler that converts an AST into code:

```ts
import {ModuleContext} from "indigo";

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

```


## TODO

- [ ] Guard against out of bounds integers
- [ ] Support imports
- [ ] Support globals
- [ ] Support memory
- [ ] Support tables
- [ ] Explore named functions/calling functions by name
- [ ] Fill out the rest of the opcodes

