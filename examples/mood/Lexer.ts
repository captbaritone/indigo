import { Position } from "./ast";

type Keyword =
  | "fn"
  | "let"
  | "pub"
  | "if"
  | "else"
  | "while"
  | "return"
  | "enum";
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
  | "+"
  | "-"
  | "*"
  | "/"
  | "."
  | "_";

export type IdentifierToken = {
  type: "Identifier";
  value: string;
  pos: Position;
};

export type EofToken = {
  type: "EOF";
  pos: Position;
};

export type Token =
  | {
      type: Keyword;
      pos: Position;
    }
  | {
      type: Syntax;
      pos: Position;
    }
  | IdentifierToken
  | {
      type: "Number";
      value: string;
      pos: Position;
    }
  | EofToken;

export function lex(code: string): Token[] {
  const lexer = new Lexer();
  return lexer.lex(code);
}

class Lexer {
  tokens: Token[];
  position: number;
  line: number;
  constructor() {
    this.tokens = [];
  }

  literal(literal: Keyword | Syntax) {
    this.tokens.push({ type: literal, pos: this.pos() });
  }

  pos(): Position {
    return { offset: this.position, line: this.line, column: 0 };
  }

  lex(code: string): Token[] {
    this.position = 0;
    this.line = 1;
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
        case " ":
        case "\t":
          this.position++;
          break;
        case "\n":
          this.line++;
          this.position++;
          break;
        case "(":
        case ")":
        case "{":
        case "}":
        case ",":
        case ";":
        case "=":
        case "+":
        case "-":
        case "*":
        case "/":
        case ".":
        case "_":
          this.literal(char);
          this.position++;
          break;
        case ":":
          if (code[this.position + 1] === ":") {
            this.literal("::");
            this.position += 2;
          } else {
            this.literal(":");
            this.position++;
          }
          break;
        case "e":
          if (
            code[this.position + 1] === "n" &&
            code[this.position + 2] === "u" &&
            code[this.position + 3] === "m"
          ) {
            this.literal("enum");
            this.position += 4;
            break;
          }
          if (
            code[this.position + 1] === "l" &&
            code[this.position + 2] === "s" &&
            code[this.position + 3] === "e"
          ) {
            this.literal("else");
            this.position += 4;
            break;
          }
        case "f":
          if (code[this.position + 1] === "n") {
            this.literal("fn");
            this.position += 2;
            break;
          }
        case "i": {
          if (code[this.position + 1] === "f") {
            this.literal("if");
            this.position += 2;
            break;
          }
        }
        case "l":
          if (
            code[this.position + 1] === "e" &&
            code[this.position + 2] === "t"
          ) {
            this.literal("let");
            this.position += 3;
            break;
          }
        case "p":
          if (
            code[this.position + 1] === "u" &&
            code[this.position + 2] === "b"
          ) {
            this.literal("pub");
            this.position += 3;
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
            this.position += 6;
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
            this.position += 5;
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
              pos: this.pos(),
            });
            break;
          }
          if (isNumeric(char)) {
            let number = char;
            this.position++;
            while (isNumeric(code[this.position])) {
              number += code[this.position];
              this.position++;
              this.tokens.push({
                type: "Number",
                value: number,
                pos: this.pos(),
              });
            }
            break;
          }
          throw new Error("Failed to progress reading char " + char);
      }
    }

    this.tokens.push({ type: "EOF", pos: this.pos() });

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
