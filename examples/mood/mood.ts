import Compiler from "./compiler";

const compile = new Compiler();
const code = `pub fn add(a, b) { a + b }`;
const binary = compile.compile(code);

const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
// @ts-ignore
console.log(instance.exports.add(1, 2));
