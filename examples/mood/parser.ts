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
  VariableDeclaration,
  ExpressionPath,
} from "./ast";
import DiagnosticError, { annotate } from "./DiagnosticError";
import { Token, lex, IdentifierToken, NumberToken } from "./lexer";

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
    const start = this.nextLoc();
    const body: Declaration[] = [];
    while (this.peek().type !== "EOF") {
      body.push(this.parseDefinition());
    }
    return {
      type: "Program",
      body,
      loc: this.locToPrev(start),
    };
  }

  // Definition ::= EnumDeclaration | FunctionDeclaration
  parseDefinition(): Declaration {
    if (this.peekEnumDeclaration()) {
      return this.parseEnumDeclaration();
    }
    if (this.peekFunctionDeclaration()) {
      return this.parseFunctionDeclaration();
    }
    throw new DiagnosticError(
      "Expected a definition.",
      annotate(this.nextLoc(), `Found ${this.peek().type}`),
    );
  }

  peekFunctionDeclaration(): boolean {
    return this.peek().type === "fn" || this.peek().type === "pub";
  }

  // FunctionDeclaration ::= "pub"? "fn" Identifier "(" ParameterList ")" ":"
  //                         TypeAnnotation BlockExpression
  parseFunctionDeclaration(): FunctionDeclaration {
    const start = this.nextLoc();
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
    const body = this.parseBlockExpression();
    return {
      type: "FunctionDeclaration",
      id,
      params,
      body,
      loc: this.locToPrev(start),
      public: pub,
      returnType,
    };
  }

  // ParameterList ::= Parameter ("," Parameter)*
  parseParameterList(): Parameter[] {
    const params: Parameter[] = [];
    while (this.peek().type !== ")" && this.peek().type !== "EOF") {
      params.push(this.parseParameter());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    return params;
  }

  // Parameter ::= Identifier ":" TypeAnnotation
  parseParameter(): Parameter {
    const start = this.nextLoc();
    const name = this.parseIdentifier();
    this.expect(":");
    const annotation = this.parseTypeAnnotation();
    return {
      type: "Parameter",
      name,
      annotation,
      loc: this.locToPrev(start),
    };
  }

  // BlockExpression ::= "{" Expression ("," Expression)* "}"
  parseBlockExpression(): BlockExpression {
    const start = this.nextLoc();
    this.expect("{");
    const expressions: Expression[] = [];
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      expressions.push(this.parseExpression());
      if (this.peek().type === ";") {
        this.next();
      }
    }
    this.expect("}");
    return {
      type: "BlockExpression",
      expressions,
      loc: this.locToPrev(start),
    };
  }

  // Expression ::= Identifier | Literal | BlockExpression
  parseExpression(): Expression {
    if (this.peekVariableDeclaration()) {
      return this.parseVariableDeclaration();
    }
    if (this.peek().type == "Identifier") {
      const identifier = this.parseIdentifier();
      if (this.peek().type === "::") {
        return this.parserExpressionPath(identifier);
      }
      return identifier;
    }
    // TODO: This will trigger an error indicating we expected a liter.
    // in reality we expect some expression head
    return this.parseLiteral();
  }

  // ExpressionPath ::= Identifier "::" Identifier
  parserExpressionPath(head: Identifier): ExpressionPath {
    this.expect("::");
    const tail = this.parseIdentifier();
    return {
      type: "ExpressionPath",
      head,
      tail,
      loc: this.locRange(head.loc, tail.loc),
    };
  }

  peekVariableDeclaration(): boolean {
    return this.peek().type === "let";
  }

  // VariableDeclaration ::= "let" Identifier ":" TypeAnnotation "=" Expression
  parseVariableDeclaration(): VariableDeclaration {
    const start = this.nextLoc();
    this.expect("let");
    const name = this.parseIdentifier();
    this.expect(":");
    const annotation = this.parseTypeAnnotation();
    this.expect("=");
    const value = this.parseExpression();
    return {
      type: "VariableDeclaration",
      name,
      value,
      annotation,
      loc: this.locToPrev(start),
    };
  }

  parseLiteral(): Literal {
    const start = this.nextLoc();
    const value = this.parseNumber();
    this.expect("_");
    const annotation = this.parseNumericType();
    return {
      type: "Literal",
      value,
      annotation,
      loc: this.locToPrev(start),
    };
  }

  parseNumber(): number {
    const digits = this.expect("Number") as NumberToken;
    if (this.peek().type === ".") {
      this.next();
      const decimal = this.expect("Number") as NumberToken;
      return parseFloat(`${digits.value}.${decimal.value}`);
    }
    return parseFloat(digits.value);
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
    const start = this.nextLoc();
    const left = this.parseExpression();
    const operator = this.parseOperator();
    const right = this.parseExpression();

    return {
      type: "BinaryExpression",
      left,
      operator,
      right,
      loc: this.locToPrev(start),
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
      annotate(token.loc, `Found ${token.type}`),
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
    const start = this.nextLoc();
    this.expect("enum");
    const id = this.parseIdentifier();
    this.expect("{");
    const variants = this.parseVariantList();
    this.expect("}");
    return {
      type: "EnumDeclaration",
      id,
      variants,
      loc: this.locToPrev(start),
    };
  }

  // VariantList ::= Variant ("," Variant)*
  parseVariantList(): Variant[] {
    const variants: Variant[] = [];
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      variants.push(this.parseVariant());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    return variants;
  }

  // Variant ::= Identifier
  parseVariant(): Variant {
    const start = this.nextLoc();
    return {
      type: "Variant",
      id: this.parseIdentifier(),
      loc: this.locToPrev(start),
    };
  }

  // Identifier ::= [a-zA-Z_][a-zA-Z0-9_]*
  parseIdentifier(): Identifier {
    const token = this.expect("Identifier") as IdentifierToken;
    return {
      type: "Identifier",
      name: token.value,
      loc: token.loc,
    };
  }

  expect(type: string): Token {
    if (this.peek().type === type) {
      return this.next();
    }
    throw new DiagnosticError(
      `Expected ${type} but found ${this.peek().type}`,
      annotate(
        this.nextLoc(),
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

  nextLoc(): Location {
    return this._tokens[this._nextIndex].loc;
  }

  prevLoc(): Location {
    return this._tokens[this._nextIndex - 1].loc;
  }

  locToPrev(start: Location): Location {
    return this.locRange(start, this.prevLoc());
  }

  locRange(start: Location, end: Location): Location {
    return { start: start.start, end: end.end };
  }
}
