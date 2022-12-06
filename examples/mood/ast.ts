export type AstNode = Program | FunctionDeclaration | Expression;
type Expression = Identifier | Literal | IfStatement | BinaryExpression;

type Program = {
  type: "Program";
  body: FunctionDeclaration[];
};

type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Parameter[];
  public: boolean;
  body: Expression;
  returnType: TypeAnnotation;
};

type Parameter = {
  type: "Parameter";
  name: Identifier;
  annotation: TypeAnnotation;
};

type TypeAnnotation = "f64";

type Identifier = {
  type: "Identifier";
  name: string;
};

type Literal = {
  type: "Literal";
  value: number | string;
};

type BinaryExpression = {
  type: "BinaryExpression";
  left: Expression;
  right: Expression;
  operator: "+" | "*";
};

type IfStatement = {
  type: "IfStatement";
  test: Expression;
  consequent: Expression;
  alternate: Expression | null;
};
