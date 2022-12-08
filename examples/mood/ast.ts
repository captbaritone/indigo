export type AstNode = Program | FunctionDeclaration | Expression;
type Expression =
  | Identifier
  | Literal
  | IfStatement
  | BinaryExpression
  | CallExpression;

type Position = { offset: number; line: number; column: number };

export type Location = {
  start: Position;
  end: Position;
};

type Program = {
  type: "Program";
  body: FunctionDeclaration[];
  loc: Location;
};

type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Parameter[];
  public: boolean;
  body: Expression;
  returnType: TypeAnnotation;
  loc: Location;
};

type Parameter = {
  type: "Parameter";
  name: Identifier;
  annotation: TypeAnnotation;
  loc: Location;
};

type NumericType = "f64" | "i32";
export type TypeAnnotation = NumericType;

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
