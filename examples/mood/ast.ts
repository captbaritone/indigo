export type AstNode = Program | Declaration | Expression;
type Expression =
  | Identifier
  | Literal
  | IfStatement
  | BinaryExpression
  | CallExpression
  | ExpressionPath;

type Position = { offset: number; line: number; column: number };

export type Location = {
  start: Position;
  end: Position;
};

type Program = {
  type: "Program";
  body: Declaration[];
  loc: Location;
};

type Declaration = FunctionDeclaration | EnumDeclaration;

type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Parameter[];
  public: boolean;
  body: Expression;
  returnType: TypeAnnotation;
  loc: Location;
};

type EnumDeclaration = {
  type: "EnumDeclaration";
  id: Identifier;
  variants: Variant[];
  loc: Location;
};

type Variant = {
  type: "Variant";
  id: Identifier;
  loc: Location;
};

type Parameter = {
  type: "Parameter";
  name: Identifier;
  annotation: TypeAnnotation;
  loc: Location;
};

type NumericType = {
  type: "PrimitiveType";
  name: "f64" | "i32";
};

export type TypeAnnotation = NumericType | Identifier;

type Identifier = {
  type: "Identifier";
  name: string;
  loc: Location;
};

type Literal = {
  type: "Literal";
  value: number | string;
  annotation: NumericType;
  loc: Location;
};

type CallExpression = {
  type: "CallExpression";
  callee: Identifier;
  args: Expression[];
  loc: Location;
};

type ExpressionPath = {
  type: "ExpressionPath";
  head: Identifier;
  tail: Identifier;
  loc: Location;
};

type BinaryExpression = {
  type: "BinaryExpression";
  left: Expression;
  right: Expression;
  operator: "+" | "*";
  loc: Location;
};

type IfStatement = {
  type: "IfStatement";
  test: Expression;
  consequent: Expression;
  alternate: Expression | null;
  loc: Location;
};
