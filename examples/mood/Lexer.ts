import { Location } from "./Location";

type Keyword =
  | "fn"
  | "let"
  | "pub"
  | "if"
  | "else"
  | "while"
  | "return"
  | "enum"
  | "struct";
type Syntax =
  | "("
  | ")"
  | "{"
  | "}"
  | ":"
  | "::"
  | ","
  | ";"
  | "="
  | "=="
  | "+"
  | "-"
  | "*"
  | "/"
  | "."
  | "_";

export type IdentifierToken = {
  type: "Identifier";
  value: string;
  loc: Location;
};

export type NumberToken = {
  type: "Number";
  value: string;
  loc: Location;
};

export type EofToken = {
  type: "EOF";
  loc: Location;
};

export type Token =
  | {
      type: Keyword;
      loc: Location;
    }
  | {
      type: Syntax;
      loc: Location;
    }
  | IdentifierToken
  | NumberToken
  | EofToken;

export function lex(code: string): Token[] {
  const lexer = new Lexer();
  return lexer.lex(code);
}

class Lexer {
  tokens: Token[];
  position: number = 0;
  line: number = 0;
  lineStart: number = 0;
  lastPosition: number = 0;
  lastLine: number = 0;
  lastLineStart: number = 0;
  constructor() {
    this.tokens = [];
  }

  literal(literal: Keyword | Syntax) {
    this.position += literal.length;
    this.tokens.push({ type: literal, loc: this.loc() });
  }

  loc(): Location {
    return {
      start: {
        offset: this.lastPosition,
        line: this.lastLine + 1,
        column: this.lastPosition - this.lastLineStart + 1,
      },
      end: {
        offset: this.position,
        line: this.line + 1,
        column: this.position - this.lineStart + 1,
      },
    };
  }

  lex(code: string): Token[] {
    // let lastPosition = -1;
    while (this.position < code.length) {
      /*
      if (this.position === lastPosition) {
        throw new Error(
          "Failed to progress. Next char is " + code[this.position] + "",
        );
      }
      lastPosition = this.position;
      */
      const char = code[this.position];
      switch (char) {
        case "/":
          if (code[this.position + 1] === "/") {
            this.position += 2;
            while (code[this.position] !== "\n") {
              this.position++;
            }
          } else {
            this.literal(char);
          }
          break;
        case " ":
        case "\t":
          this.position++;
          break;
        case "\n":
          this.line++;
          this.position++;
          this.lineStart = this.position;
          break;
        case "(":
        case ")":
        case "{":
        case "}":
        case ",":
        case ";":
        case "+":
        case "-":
        case "*":
        case ".":
        case "_":
          this.literal(char);
          break;
        case "=":
          if (code[this.position + 1] === "=") {
            this.literal("==");
          } else {
            this.literal("=");
          }
          break;
        case ":":
          if (code[this.position + 1] === ":") {
            this.literal("::");
          } else {
            this.literal(":");
          }
          break;
        case "e":
          if (
            code[this.position + 1] === "n" &&
            code[this.position + 2] === "u" &&
            code[this.position + 3] === "m"
          ) {
            this.literal("enum");
            break;
          }
          if (
            code[this.position + 1] === "l" &&
            code[this.position + 2] === "s" &&
            code[this.position + 3] === "e"
          ) {
            this.literal("else");
            break;
          }
        case "f":
          if (code[this.position + 1] === "n") {
            this.literal("fn");
            break;
          }
        case "i": {
          if (code[this.position + 1] === "f") {
            this.literal("if");
            break;
          }
        }
        case "l":
          if (
            code[this.position + 1] === "e" &&
            code[this.position + 2] === "t"
          ) {
            this.literal("let");
            break;
          }
        case "p":
          if (
            code[this.position + 1] === "u" &&
            code[this.position + 2] === "b"
          ) {
            this.literal("pub");
            break;
          }

        case "r":
          if (
            code[this.position + 1] === "e" &&
            code[this.position + 2] === "t" &&
            code[this.position + 3] === "u" &&
            code[this.position + 4] === "r" &&
            code[this.position + 5] === "n"
          ) {
            this.literal("return");
            break;
          }

        case "s":
          if (
            code[this.position + 1] === "t" &&
            code[this.position + 2] === "r" &&
            code[this.position + 3] === "u" &&
            code[this.position + 4] === "c" &&
            code[this.position + 5] === "t"
          ) {
            this.literal("struct");
            break;
          }
        case "w":
          if (
            code[this.position + 1] === "h" &&
            code[this.position + 2] === "i" &&
            code[this.position + 3] === "l" &&
            code[this.position + 4] === "e"
          ) {
            this.literal("while");
            break;
          }
        default:
          if (isIdentifierHead(char)) {
            let identifier = char;
            this.position++;
            while (isIdentifierTail(code[this.position])) {
              identifier += code[this.position];
              this.position++;
            }
            this.tokens.push({
              type: "Identifier",
              value: identifier,
              loc: this.loc(),
            });
            break;
          }
          if (isNumeric(char)) {
            let number = char;
            this.position++;
            while (isNumeric(code[this.position])) {
              number += code[this.position];
              this.position++;
            }
            this.tokens.push({
              type: "Number",
              value: number,
              loc: this.loc(),
            });
            break;
          }
          throw new Error("Failed to progress reading char " + char);
      }
      this.lastPosition = this.position;
      this.lastLine = this.line;
      this.lastLineStart = this.lineStart;
    }

    this.tokens.push({ type: "EOF", loc: this.loc() });

    return this.tokens;
  }
}

function isNumeric(char: string): boolean {
  return char.charCodeAt(0) >= 48 && char.charCodeAt(0) <= 57;
}

// Ascii letters upper and lower case
function isIdentifierHead(char: string): boolean {
  return char.charCodeAt(0) >= 65 && char.charCodeAt(0) <= 122;
}

function isIdentifierTail(char: string) {
  return isIdentifierHead(char) || isNumeric(char);
}
