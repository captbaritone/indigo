import peg from "pegjs";
import fs from "fs";
import { AstNode } from "./ast";
import DiagnosticError, { annotate } from "./DiagnosticError";

const GRAMMAR = fs.readFileSync("./examples/mood/mood.pegjs", "utf-8");

const parser = peg.generate(GRAMMAR);
export default {
  parse(code: string): AstNode {
    try {
      return parser.parse(code);
    } catch (e) {
      if (e instanceof parser.SyntaxError) {
        throw new DiagnosticError(
          e.message,
          annotate(e.location, "Syntax error"),
        );
      }
      throw e;
    }
  },
};
