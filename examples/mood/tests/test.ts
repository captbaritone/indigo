import compile from "../compiler";
import fs from "fs";
import path from "path";

const fixturesDir = path.join(__dirname, "fixtures");

const testFixtures = fs.readdirSync(fixturesDir);

for (const fixture of testFixtures) {
  const fixtureContent = fs.readFileSync(
    path.join(fixturesDir, fixture),
    "utf-8",
  );
  console.log(fixtureContent);
  const binary = compile(fixtureContent);
  if (binary.type === "error") {
    console.error(binary.value.reportDiagnostic(fixtureContent));
  } else {
    const instance = new WebAssembly.Instance(
      new WebAssembly.Module(binary.value),
      {},
    );

    if (typeof instance.exports.test !== "function") {
      throw new Error("Expected test function to be exported");
    }
    // @ts-ignore
    console.log(instance.exports.test());
  }
}
