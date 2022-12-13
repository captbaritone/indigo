# Indigo

Indigo (codename, to be renamed before release) is a light-weight TypeScript
module that makes it easy to construct binary WebAssembly modules from
TypeScript in the browser or Node. It's intended for use cases where you are
comfortable writing raw Wasm instructions, but want to have some structure:

- Provides type safety for WebAssembly instructions
- Handles binary encoding of instructions/values
- Handles module encoding/structure

Indigo is intended for use cases such as just-in-time compilation (JIT), where
the Wasm module is constructed at runtime. For example, if you want to provide a
user-accessible domain specific language (DSL) for your users which compiles to
Wasm. This this end, Indigo is light weight and optimizes for simplicity and
construction speed rather than the size or performance of the resulting Wasm
module.

## Examples

TODO