import compile from "./compiler";
import fs from "fs";

const code = fs.readFileSync(
  "./examples/mood/fixtures/call_expression.mood",
  "utf-8",
);
const binary = compile(code);

if (binary !== null) {
  const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
  // @ts-ignore
  console.log(instance.exports.double(5));
}
