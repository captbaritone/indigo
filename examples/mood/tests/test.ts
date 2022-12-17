import compile from "../compiler";
import path from "path";
import getWabt from "wabt";
import TestRunner from "./TestRunner";
const wabtPromise = getWabt();

async function main() {
  const write = process.argv.some((arg) => arg === "--write");
  const filter = process.argv.find((arg) => arg.startsWith("--filter="));

  const filterRegex = filter != null ? filter.slice(9) : null;
  let failures = false;
  for (const { fixturesDir, transformer } of testDirs) {
    const runner = new TestRunner(fixturesDir, write, filterRegex, transformer);
    failures = (await runner.run()) || failures;
  }
  if (failures) {
    process.exit(1);
  }
}

const testDirs = [
  {
    fixturesDir: path.join(__dirname, "wasm"),
    transformer: async (code: string, fileName: string) => {
      const binary = compile(code);
      const wabt = await wabtPromise;
      const myModule = wabt.readWasm(binary, { readDebugNames: true });
      return myModule.toText({ foldExprs: false, inlineExport: false });
    },
  },
  {
    fixturesDir: path.join(__dirname, "evaluate"),
    transformer: async (code: string, fileName: string) => {
      const binary = compile(code);
      const instance = new WebAssembly.Instance(
        new WebAssembly.Module(binary),
        {},
      );
      if (typeof instance.exports.test !== "function") {
        throw new Error("Expected test function to be exported");
      }
      // @ts-ignore
      return String(instance.exports.test());
    },
  },
];

main();
