import peg from "pegjs";
import fs from "fs";
import {
  AstNode,
  Declaration,
  Location,
  Program,
  EnumDeclaration,
  Identifier,
  Variant,
  FunctionDeclaration,
  BlockExpression,
  TypeAnnotation,
  Parameter,
  Expression,
  BinaryExpression,
  Literal,
  NumericType,
} from "./ast";
import DiagnosticError, { annotate } from "./DiagnosticError";
import { Token, lex, IdentifierToken } from "./lexer";

const GRAMMAR = fs.readFileSync("./examples/mood/mood.pegjs", "utf-8");

const parser = peg.generate(GRAMMAR);

function pegParse(code: string): AstNode {
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
}

export function parse(code: string): AstNode {
  if (process.env.HANDWRITTEN_PARSER) {
    const tokens = lex(code);
    const parser = new Parser(tokens);
    return parser.parse();
  }
  return pegParse(code);
}

// TODO: Get clearer with specifics around trailing commas/semicolons
class Parser {
  _tokens: Token[];
  _nextIndex: number;
  constructor(tokens: Token[]) {
    this._tokens = tokens;
    this._nextIndex = 0;
  }
  // Program
  parse(): AstNode {
    return this.parseProgram();
  }

  // Program ::= Definition*
  parseProgram(): Program {
    const body: Declaration[] = [];
    while (this._tokens.length > 0) {
      body.push(this.parseDefinition());
    }
    return {
      type: "Program",
      body,
      loc: this.dummyLoc(),
    };
  }

  // Definition ::= EnumDeclaration | FunctionDeclaration
  parseDefinition(): Declaration {
    if (this.peekEnumDeclaration()) {
      return this.parseEnumDeclaration();
    }
    if (this.peekFunctionDeclaration()) {
      this.parseFunctionDeclaration();
    }
    throw new DiagnosticError(
      "Expected a definition.",
      annotate(this.dummyLoc(), `Found ${this.peek().type}`),
    );
  }

  peekFunctionDeclaration(): boolean {
    return this.peek().type === "fn" || this.peek().type === "pub";
  }

  // FunctionDeclaration ::= "pub"? "fn" Identifier "(" ParameterList ")" ":"
  //                         TypeAnnotation BlockExpression
  parseFunctionDeclaration(): FunctionDeclaration {
    const pub = this.peek().type === "pub";
    if (pub) {
      this.next();
    }
    this.expect("fn");
    const id = this.parseIdentifier();
    this.expect("(");
    const params = this.parseParameterList();
    this.expect(")");
    this.expect(":");
    const returnType = this.parseTypeAnnotation();
    console.log({ returnType });
    const body = this.parseBlockExpression();
    return {
      type: "FunctionDeclaration",
      id,
      params,
      body,
      loc: this.dummyLoc(),
      public: pub,
      returnType,
    };
  }

  // ParameterList ::= Parameter ("," Parameter)*
  parseParameterList(): Parameter[] {
    const params: Parameter[] = [];
    while (this.peek().type !== ")" && this.peek().type !== "EOF") {
      params.push(this.parseParameter());
      if (this.peek().type !== ",") {
        break;
      }
    }
    return params;
  }

  // Parameter ::= Identifier ":" TypeAnnotation
  parseParameter(): Parameter {
    const name = this.parseIdentifier();
    this.expect(":");
    const annotation = this.parseTypeAnnotation();
    return {
      type: "Parameter",
      name,
      annotation,
      loc: this.dummyLoc(),
    };
  }

  // BlockExpression ::= "{" Expression ("," Expression)* "}"
  parseBlockExpression(): BlockExpression {
    this.expect("{");
    const expressions: Expression[] = [];
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      expressions.push(this.parseExpression());
      if (this.peek().type !== ";") {
        break;
      }
    }
    return {
      type: "BlockExpression",
      expressions,
      loc: this.dummyLoc(),
    };
  }

  // Expression ::= Identifier | Literal | BlockExpression
  parseExpression(): Expression {
    return this.parseLiteral();
  }

  parseLiteral(): Literal {
    const digits = this.expect("Number");
    this.expect(".");
    const decimal = this.expect("Number");
    const value = parseFloat(`${digits}.${decimal}`);
    this.expect("_");
    const annotation = this.parseNumericType();
    return {
      type: "Literal",
      value,
      annotation,
      loc: this.dummyLoc(),
    };
  }

  parseNumericType(): NumericType {
    const id = this.parseIdentifier();
    switch (id.name) {
      case "i32":
      case "f64":
        return {
          type: "PrimitiveType",
          name: id.name,
        };
    }
    throw new DiagnosticError("Expected a numeric type", annotate(id.loc, ""));
  }

  // BinaryExpression ::= Expression Operator Expression
  parseBinaryExpression(): BinaryExpression {
    const left = this.parseExpression();
    const operator = this.parseOperator();
    const right = this.parseExpression();

    return {
      type: "BinaryExpression",
      left,
      operator,
      right,
      loc: this.dummyLoc(),
    };
  }

  parseOperator(): "+" | "*" {
    const token = this.next();
    switch (token.type) {
      case "+":
      case "*":
        return token.type;
    }
    throw new DiagnosticError(
      "Expected an operator",
      annotate(this.dummyLoc(), `Found ${token.type}`),
    );
  }

  // TypeAnnotation ::= Identifier | PrimitiveType
  parseTypeAnnotation(): TypeAnnotation {
    const id = this.parseIdentifier();
    switch (id.name) {
      case "i32":
      case "f64":
        return {
          type: "PrimitiveType",
          name: id.name,
        };
    }
    return id;
  }

  peekEnumDeclaration(): boolean {
    return this.peek().type === "enum";
  }

  // EnumDeclaration ::= "enum" Identifier "{" VariantList "}"
  parseEnumDeclaration(): EnumDeclaration {
    this.expect("enum");
    const id = this.parseIdentifier();
    this.expect("{");
    const variants = this.parseVariantList();
    this.expect("}");
    return {
      type: "EnumDeclaration",
      id,
      variants,
      loc: this.dummyLoc(),
    };
  }

  // VariantList ::= Variant ("," Variant)*
  parseVariantList(): Variant[] {
    const variants: Variant[] = [];
    while (this.peek().type !== ")" && this.peek().type !== "EOF") {
      variants.push(this.parseVariant());
      if (this.peek().type !== ",") {
        break;
      }
    }
    return variants;
  }

  // Variant ::= Identifier
  parseVariant(): Variant {
    return {
      type: "Variant",
      id: this.parseIdentifier(),
      loc: this.dummyLoc(),
    };
  }

  // Identifier ::= [a-zA-Z_][a-zA-Z0-9_]*
  parseIdentifier(): Identifier {
    const token = this.expect("Identifier") as IdentifierToken;
    return {
      type: "Identifier",
      name: token.value,
      loc: this.dummyLoc(),
    };
  }

  expect(type: string): Token {
    if (this.peek().type === type) {
      return this.next();
    }
    throw new DiagnosticError(
      `Expected ${type} but found ${this.peek().type}`,
      annotate(
        this.dummyLoc(),
        `Expected ${type} but found ${this.peek().type}`,
      ),
    );
  }

  next() {
    return this._tokens[this._nextIndex++];
  }

  peek() {
    return this._tokens[this._nextIndex];
  }

  dummyLoc(): Location {
    return {
      start: {
        offset: 0,
        line: 0,
        column: 0,
      },
      end: {
        offset: 0,
        line: 0,
        column: 0,
      },
    };
  }
}
