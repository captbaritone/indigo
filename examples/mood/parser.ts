import peg from "pegjs";
import fs from "fs";

const GRAMMAR = fs.readFileSync("./examples/mood/mood.pegjs", "utf-8");

const parser = peg.generate(GRAMMAR);
export default parser;
