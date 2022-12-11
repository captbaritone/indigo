export type AstNode = Program | Declaration | Expression;
export type Expression =
  | Identifier
  | Literal
  | IfStatement
  | BinaryExpression
  | CallExpression
  | ExpressionPath
  | BlockExpression
  | VariableDeclaration;

export type Position = { offset: number; line: number; column: number };

export type Location = {
  start: Position;
  end: Position;
};

export function lastChar(location: Location): Location {
  return {
    start: {
      offset: location.end.offset - 1,
      line: location.end.line,
      column: location.end.column - 1,
    },
    end: location.end,
  };
}

export function union(start: Location, end: Location): Location {
  return { start: start.start, end: end.end };
}

export type Program = {
  type: "Program";
  body: Declaration[];
  loc: Location;
};

export type Declaration = FunctionDeclaration | EnumDeclaration;

export type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Parameter[];
  public: boolean;
  body: BlockExpression;
  returnType: TypeAnnotation;
  loc: Location;
};

export type BlockExpression = {
  type: "BlockExpression";
  expressions: Expression[];
  loc: Location;
};

export type EnumDeclaration = {
  type: "EnumDeclaration";
  id: Identifier;
  variants: Variant[];
  loc: Location;
};

export type Variant = {
  type: "Variant";
  id: Identifier;
  loc: Location;
};

export type Parameter = {
  type: "Parameter";
  name: Identifier;
  annotation: TypeAnnotation;
  loc: Location;
};

export type NumericType = {
  type: "PrimitiveType";
  name: "f64" | "i32";
};

export type VariableDeclaration = {
  type: "VariableDeclaration";
  name: Identifier;
  value: Expression;
  annotation: TypeAnnotation;
  loc: Location;
};

export type TypeAnnotation = Identifier;

export type Identifier = {
  type: "Identifier";
  name: string;
  loc: Location;
};

export type Literal = {
  type: "Literal";
  value: any;
  annotation: TypeAnnotation;
  loc: Location;
};

export type CallExpression = {
  type: "CallExpression";
  callee: Identifier;
  args: Expression[];
  loc: Location;
};

export type ExpressionPath = {
  type: "ExpressionPath";
  head: Identifier;
  tail: Identifier;
  loc: Location;
};

export type BinaryExpression = {
  type: "BinaryExpression";
  left: Expression;
  right: Expression;
  operator: "+" | "*";
  loc: Location;
};

export type IfStatement = {
  type: "IfStatement";
  test: Expression;
  consequent: Expression;
  alternate: Expression | null;
  loc: Location;
};
