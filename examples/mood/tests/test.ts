import compile from "../compiler";
import * as Parser from "../Parser";
import fs from "fs";
import path from "path";
import { diff } from "jest-diff";
import { catchToResult } from "../DiagnosticError";

const WRITE_FIXTURES = process.argv.some((arg) => arg === "--write");
const filter = process.argv.find((arg) => arg.startsWith("--filter="));

const filterRegex = filter != null ? new RegExp(filter.slice(9)) : null;
const fixturesDir = path.join(__dirname, "fixtures");

const testFixtures: string[] = [];
const otherFiles: Set<string> = new Set();
const skip: Set<string> = new Set();

for (const fileName of fs.readdirSync(fixturesDir)) {
  if (fileName.endsWith(".mood")) {
    testFixtures.push(fileName);
    if (filterRegex != null && !fileName.match(filterRegex)) {
      skip.add(fileName);
    }
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
  if (skip.has(fixture)) {
    console.log("SKIP: " + fixture);
    continue;
  }
  const expectedContent = fs.readFileSync(expectedFilePath, "utf-8");

  const fixtureContent = fs.readFileSync(
    path.join(fixturesDir, fixture),
    "utf-8",
  );

  const actual = evaluate(fixtureContent, fixture);

  if (actual !== expectedContent) {
    if (WRITE_FIXTURES) {
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
    `${failureCount} failures found. Run with --write to update fixtures`,
  );
  process.exit(1);
} else {
  console.log("All tests passed!");
}

if (otherFiles.size > 0) {
  if (WRITE_FIXTURES) {
    for (const fileName of otherFiles) {
      console.log("DELETED: " + fileName);
      fs.unlinkSync(path.join(fixturesDir, fileName));
    }
  } else {
    console.log("Unexpected files found:");
    for (const fileName of otherFiles) {
      console.log(" - " + fileName);
    }
    console.log("Run with --write to deleted unexpected files");
    process.exit(1);
  }
}

function evaluate(code: string, fileName: string): string {
  try {
    const binary = compile(code);
    if (binary.type === "error") {
      return binary.value.asCodeFrame(code, fileName);
    } else {
      const instance = new WebAssembly.Instance(
        new WebAssembly.Module(binary.value),
        {},
      );

      if (typeof instance.exports.test !== "function") {
        throw new Error("Expected test function to be exported");
      }
      // @ts-ignore
      return String(instance.exports.test());
    }
  } catch (e) {
    return e.stack;
  }
}
