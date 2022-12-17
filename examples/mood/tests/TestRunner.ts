import fs from "fs";
import path from "path";
import { diff } from "jest-diff";
import DiagnosticError, { Result, catchToResult } from "../DiagnosticError";

type Transformer = (code: string, filename: string) => Promise<string>;

/**
 * Looks in a fixtures dir for .mood files, transforms them according to the
 * passed transformer, and compares the output to the expected output in the
 * `.expected` file.
 */
export default class TestRunner {
  _write: boolean;
  _fixturesDir: string;
  _testFixtures: string[] = [];
  _otherFiles: Set<string> = new Set();
  _skip: Set<string> = new Set();
  _failureCount: number = 0;
  _transformer: Transformer;

  constructor(
    fixturesDir: string,
    write: boolean,
    filter: string | null,
    transformer: Transformer,
  ) {
    this._write = write;
    this._fixturesDir = fixturesDir;
    this._transformer = transformer;
    const filterRegex = filter != null ? new RegExp(filter) : null;
    for (const fileName of fs.readdirSync(fixturesDir)) {
      if (fileName.endsWith(".mood")) {
        this._testFixtures.push(fileName);
        if (filterRegex != null && !fileName.match(filterRegex)) {
          this._skip.add(fileName);
        }
      } else {
        this._otherFiles.add(fileName);
      }
    }
  }

  async run() {
    for (const fixture of this._testFixtures) {
      await this._testFixture(fixture);
    }
    console.log("");

    if (this._failureCount > 0) {
      console.log(
        `${this._failureCount} failures found. Run with --write to update fixtures`,
      );
      process.exit(1);
    } else {
      console.log("All tests passed!");
    }

    if (this._otherFiles.size > 0) {
      if (this._write) {
        for (const fileName of this._otherFiles) {
          console.log("DELETED: " + fileName);
          fs.unlinkSync(path.join(this._fixturesDir, fileName));
        }
      } else {
        console.log("Unexpected files found:");
        for (const fileName of this._otherFiles) {
          console.log(" - " + fileName);
        }
        console.log("Run with --write to deleted unexpected files");
        process.exit(1);
      }
    }
  }

  async _testFixture(fixture: string) {
    const expectedFileName = fixture + ".expected";
    const expectedFilePath = path.join(this._fixturesDir, expectedFileName);
    if (this._otherFiles.has(expectedFileName)) {
      this._otherFiles.delete(expectedFileName);
    } else {
      fs.writeFileSync(expectedFilePath, "", "utf-8");
    }
    if (this._skip.has(fixture)) {
      return;
    }
    const expectedContent = fs.readFileSync(expectedFilePath, "utf-8");

    const fixtureContent = fs.readFileSync(
      path.join(this._fixturesDir, fixture),
      "utf-8",
    );

    const actual = await this.transform(fixtureContent, fixture);

    if (actual !== expectedContent) {
      if (this._write) {
        console.error("UPDATED: " + fixture);
        fs.writeFileSync(expectedFilePath, actual, "utf-8");
      } else {
        this._failureCount++;
        console.error("FAILURE: " + fixture);
        console.log(diff(expectedContent, actual));
      }
    } else {
      console.log("OK: " + fixture);
    }
  }

  async transform(code: string, filename: string): Promise<string> {
    try {
      return await this._transformer(code, filename);
    } catch (e) {
      if (e instanceof DiagnosticError) {
        return e.asCodeFrame(code, filename);
      }
      return e.message;
    }
  }
}
