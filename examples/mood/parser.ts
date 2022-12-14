import {
  AstNode,
  Declaration,
  Program,
  EnumDeclaration,
  Identifier,
  VariantDeclaration,
  FunctionDeclaration,
  BlockExpression,
  Parameter,
  Expression,
  BinaryExpression,
  Literal,
  VariableDeclaration,
  ExpressionPath,
  CallExpression,
  StructDeclaration,
  StructField,
  StructConstruction,
  StructFieldConstruction,
  MemberExpression,
} from "./ast";
import { Location, union, firstChar } from "./Location";
import DiagnosticError, { annotate } from "./DiagnosticError";
import { Token, lex, IdentifierToken, NumberToken } from "./lexer";

const MAX_BINDING_POWER = 10;

/**
 * Mood uses a recursive descent parser which employs precedence climbing to
 * resolver operator precedence.
 *
 * Each node type has a parsing method (`parse<NODE_TYPE>`) as well as a "peek"
 * method (`peek<NODE_TYPE>`) which determines whether the parser is at the
 * start of a node of that type.
 *
 * Each parse method is commented with the grammar rule it implements.
 *
 * For more information on Precedence Climbing, see:
 * https://en.wikipedia.org/wiki/Operator-precedence_parser#Precedence_climbing_method
 */
export function parse(code: string): AstNode {
  const tokens = lex(code);
  const parser = new Parser(tokens);
  return parser.parse();
}

// TODO: Add fixture tests for each error.
class Parser {
  _tokens: Token[];
  _nextIndex: number;
  _nextNodeId: number = 0;
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

  // Definition ::= EnumDeclaration | FunctionDeclaration | StructDeclaration
  parseDefinition(): Declaration {
    if (this.peekEnumDeclaration()) {
      return this.parseEnumDeclaration();
    }
    if (this.peekFunctionDeclaration()) {
      return this.parseFunctionDeclaration();
    }
    if (this.peekStructDeclaration()) {
      return this.parseStructDeclaration();
    }
    throw new DiagnosticError(
      "Expected a definition.",
      annotate(this.nextLoc(), `Found ${this.peek().type}`),
    );
  }

  peekStructDeclaration(): boolean {
    return this.peek().type === "struct";
  }

  // StructDeclaration ::= "struct" Identifier "{" StructField* "}"
  parseStructDeclaration(): StructDeclaration {
    const start = this.nextLoc();
    this.expect("struct");
    const id = this.parseIdentifier();
    this.expect("{");
    const fields: StructField[] = [];
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      fields.push(this.parseStructField());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    this.expect("}");

    return {
      type: "StructDeclaration",
      id,
      fields,
      loc: this.locToPrev(start),
    };
  }

  // StructField ::= Identifier ":" TypeAnnotation
  parseStructField(): StructField {
    const start = this.nextLoc();
    const id = this.parseIdentifier();
    this.expect(":");
    const annotation = this.parseIdentifier();
    return {
      type: "StructField",
      id,
      annotation,
      loc: this.locToPrev(start),
    };
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
    const returnType = this.parseIdentifier();
    const body = this.parseBlockExpression();
    return {
      type: "FunctionDeclaration",
      id,
      params,
      body,
      loc: this.locToPrev(start),
      public: pub,
      returnType,
      nodeId: this.nextNodeId(),
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
    const annotation = this.parseIdentifier();
    return {
      type: "Parameter",
      name,
      annotation,
      loc: this.locToPrev(start),
      nodeId: this.nextNodeId(),
    };
  }

  // BlockExpression ::= "{" Expression (";" Expression)* ";"?"}"
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
      nodeId: this.nextNodeId(),
    };
  }

  // Expression ::= Identifier | Literal | BinaryExpression | CallExpression |
  //                ExpressionPath | BlockExpression | VariableDeclaration |
  //                StructConstruction | MemberExpression
  parseExpression(bindingPower: number = MAX_BINDING_POWER): Expression {
    let exp = this.parseExpressionImpl();
    while (this.peekBinaryOperator()) {
      const operatorBindingPower = getOperatorBindingPower(this.peek().type);
      if (bindingPower < operatorBindingPower) {
        break;
      }
      exp = this.parseBinaryExpression(exp, operatorBindingPower);
    }
    return exp;
  }

  peekBinaryOperator(): boolean {
    return (
      this.peek().type === "+" ||
      this.peek().type === "*" ||
      this.peek().type === "=="
    );
  }

  parseExpressionImpl(): Expression {
    if (this.peekVariableDeclaration()) {
      return this.parseVariableDeclaration();
    } else if (this.peekLiteral()) {
      return this.parseLiteral();
    } else if (this.peek().type === "Identifier") {
      const identifier = this.parseIdentifier();
      if (this.peek().type === "{") {
        return this.parseStructConstruction(identifier);
      } else if (this.peek().type === ".") {
        return this.parseMemberExpression(identifier);
      } else if (this.peek().type === "::") {
        return this.parseExpressionPath(identifier);
      } else if (this.peek().type === "(") {
        return this.parseCallExpression(identifier);
      } else {
        return identifier;
      }
    } else if (this.peek().type === "(") {
      this.next();
      const exp = this.parseExpression();
      this.expect(")");
      return exp;
    }
    throw new DiagnosticError(
      "Expected an expression, got " + this.peek().type,
      annotate(this.nextLoc(), "Found " + this.peek().type),
    );
  }

  // StructConstruction ::= Identifier "{" StructField* "}"
  parseStructConstruction(id: Identifier): StructConstruction {
    const fields: StructFieldConstruction[] = [];
    this.expect("{");
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      fields.push(this.parseStructFieldConstruction());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    this.expect("}");
    return {
      type: "StructConstruction",
      id,
      fields,
      loc: this.locToPrev(id.loc),
      nodeId: this.nextNodeId(),
    };
  }

  // StructField ::= Identifier ":" Expression
  parseStructFieldConstruction(): StructFieldConstruction {
    const start = this.nextLoc();
    const name = this.parseIdentifier();
    this.expect(":");
    const value = this.parseExpression();
    return {
      type: "StructFieldConstruction",
      name,
      value,
      loc: this.locToPrev(start),
      nodeId: this.nextNodeId(),
    };
  }

  // CallExpression ::= Identifier "(" ExpressionList ")"
  parseCallExpression(callee: Identifier): CallExpression {
    const args = this.parseExpressionList();
    return {
      type: "CallExpression",
      callee: callee,
      args,
      loc: union(callee.loc, this.prevLoc()),
      nodeId: this.nextNodeId(),
    };
  }

  parseExpressionList(): Expression[] {
    const args: Expression[] = [];
    this.expect("(");
    while (this.peek().type !== ")" && this.peek().type !== "EOF") {
      args.push(this.parseExpression());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    this.expect(")");
    return args;
  }

  peekLiteral(): boolean {
    const next = this.peek();
    return (
      next.type === "Number" ||
      (next.type === "Identifier" && next.value === "true") ||
      (next.type === "Identifier" && next.value === "false")
    );
  }

  // ExpressionPath ::= Identifier "::" Identifier
  parseExpressionPath(head: Identifier): ExpressionPath {
    this.expect("::");
    let tail: Identifier | CallExpression = this.parseIdentifier();
    if (this.peek().type === "(") {
      tail = this.parseCallExpression(tail);
    }
    return {
      type: "ExpressionPath",
      head,
      tail,
      loc: union(head.loc, tail.loc),
      nodeId: this.nextNodeId(),
    };
  }

  parseMemberExpression(head: Identifier): MemberExpression {
    this.expect(".");
    const tail = this.parseIdentifier();
    return {
      type: "MemberExpression",
      head,
      tail,
      loc: union(head.loc, tail.loc),
      nodeId: this.nextNodeId(),
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
    const annotation = this.parseIdentifier();
    this.expect("=");
    const value = this.parseExpression();
    return {
      type: "VariableDeclaration",
      name,
      value,
      annotation,
      loc: this.locToPrev(start),
      nodeId: this.nextNodeId(),
    };
  }

  parseLiteral(): Literal {
    const start = this.nextLoc();
    const next = this.peek();
    if (next.type === "Number") {
      const value = this.parseNumber();
      if (this.peek().type !== "_") {
        throw new DiagnosticError(
          "Expected a number literal to be followed by a type hint.",
          annotate(
            firstChar(this.peek().loc),
            `Expected a numeric type hint like "_i32" or "_f32"`,
          ),
        );
      } else {
        this.next();
      }
      const annotation = this.parseNumericType();
      return {
        type: "Literal",
        value,
        annotation,
        loc: this.locToPrev(start),
        nodeId: this.nextNodeId(),
      };
    } else if (next.type === "Identifier") {
      const annotation = {
        type: "Identifier",
        name: "bool",
        loc: next.loc,
        nodeId: this.nextNodeId(),
      } as const;
      if (next.value === "true") {
        this.next();
        return {
          type: "Literal",
          value: true,
          annotation,
          loc: this.locToPrev(start),
          nodeId: this.nextNodeId(),
        };
      } else if (next.value === "false") {
        this.next();
        return {
          type: "Literal",
          value: false,
          annotation,
          loc: this.locToPrev(start),
          nodeId: this.nextNodeId(),
        };
      }
    }
    throw new Error(`Expected a literal, got "${next.type}"`);
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

  parseNumericType(): Identifier {
    const id = this.parseIdentifier();
    switch (id.name) {
      case "i32":
      case "f64":
        return id;
      default:
        throw new DiagnosticError(
          "Expected a numeric type",
          annotate(id.loc, ""),
        );
    }
  }

  // BinaryExpression ::= Expression Operator Expression
  parseBinaryExpression(
    left: Expression,
    bindingPower: number,
  ): BinaryExpression {
    const operator = this.parseOperator();
    const right = this.parseExpression(bindingPower);

    return {
      type: "BinaryExpression",
      left,
      operator,
      right,
      loc: union(left.loc, right.loc),
      nodeId: this.nextNodeId(),
    };
  }

  parseOperator(): "+" | "*" | "==" {
    const token = this.next();
    switch (token.type) {
      case "+":
      case "*":
      case "==":
        return token.type;
    }
    throw new DiagnosticError(
      "Expected an operator",
      annotate(token.loc, `Found ${token.type}`),
    );
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

  // VariantList ::= VariantDeclaration ("," VariantDeclaration)*
  parseVariantList(): VariantDeclaration[] {
    const variants: VariantDeclaration[] = [];
    while (this.peek().type !== "}" && this.peek().type !== "EOF") {
      variants.push(this.parseVariantDeclaration());
      if (this.peek().type === ",") {
        this.next();
      }
    }
    return variants;
  }

  // Variant ::= Identifier ("(" Identifier ")")?
  parseVariantDeclaration(): VariantDeclaration {
    const start = this.nextLoc();
    const id = this.parseIdentifier();
    let valueType: Identifier | null = null;
    if (this.peek().type === "(") {
      this.next();
      valueType = this.parseIdentifier();
      this.expect(")");
    }
    return {
      type: "Variant",
      id,
      valueType,
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
      nodeId: this.nextNodeId(),
    };
  }

  expect(type: string): Token {
    if (this.peek().type === type) {
      return this.next();
    }
    throw new DiagnosticError(
      `Expected ${type} but found "${this.peek().type}"`,
      annotate(
        this.nextLoc(),
        `Expected ${type} but found "${this.peek().type}"`,
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
    return union(start, this.prevLoc());
  }

  nextNodeId() {
    return this._nextNodeId++;
  }
}

function getOperatorBindingPower(op: string): number {
  switch (op) {
    case "+":
      return 0;
    case "*":
      return 1;
    case "==":
      return 2;
    default:
      throw new Error(`Unknown operator ${op}`);
  }
}
