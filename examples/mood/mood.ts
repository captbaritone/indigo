import compile from "./compiler";
import fs from "fs";

const code = fs.readFileSync("./examples/mood/fixtures/add.mood", "utf-8");
const binary = compile(code);

const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
// @ts-ignore
console.log(instance.exports.add(1, 2));
// @ts-ignore
console.log(instance.exports.mul(10, 22));
