import compile from "../compiler";
import fs from "fs";
import path from "path";
import { diff } from "jest-diff";

const fixturesDir = path.join(__dirname, "fixtures");

const testFixtures: string[] = [];
const otherFiles: Set<string> = new Set();

for (const fileName of fs.readdirSync(fixturesDir)) {
  if (fileName.endsWith(".mood")) {
    testFixtures.push(fileName);
  } else {
    otherFiles.add(fileName);
  }
}

let failureCount = 0;

for (const fixture of testFixtures) {
  const expectedFileName = fixture + ".expected";
  const expectedFilePath = path.join(fixturesDir, expectedFileName);
  if (otherFiles.has(expectedFileName)) {
    otherFiles.delete(expectedFileName);
  } else {
    fs.writeFileSync(expectedFilePath, "", "utf-8");
  }
  const expectedContent = fs.readFileSync(expectedFilePath, "utf-8");

  const fixtureContent = fs.readFileSync(
    path.join(fixturesDir, fixture),
    "utf-8",
  );

  const binary = compile(fixtureContent);
  let actual: string;
  if (binary.type === "error") {
    actual = binary.value.asCodeFrame(fixtureContent, fixture);
  } else {
    const instance = new WebAssembly.Instance(
      new WebAssembly.Module(binary.value),
      {},
    );

    if (typeof instance.exports.test !== "function") {
      throw new Error("Expected test function to be exported");
    }
    // @ts-ignore
    actual = String(instance.exports.test());
  }

  if (actual !== expectedContent) {
    if (process.env.WRITE_FIXTURES) {
      console.error("UPDATED: " + fixture);
      fs.writeFileSync(expectedFilePath, actual, "utf-8");
    } else {
      failureCount++;
      console.error("FAILURE: " + fixture);
      console.log(diff(expectedContent, actual));
    }
  } else {
    console.log("OK: " + fixture);
  }
}
console.log("");

if (failureCount > 0) {
  console.log(
    `${failureCount} failures found. Run with WRITE_FIXTURES=1 to update fixtures`,
  );
  process.exit(1);
} else {
  console.log("All tests passed!");
}

if (otherFiles.size > 0) {
  if (process.env.WRITE_FIXTURES) {
    for (const fileName of otherFiles) {
      console.log("DELETED: " + fileName);
      fs.unlinkSync(path.join(fixturesDir, fileName));
    }
  } else {
    console.log("Unexpected files found:");
    for (const fileName of otherFiles) {
      console.log(" - " + fileName);
    }
    console.log("Run with WRITE_FIXTURES=1 to deleted unexpected files");
    process.exit(1);
  }
}
