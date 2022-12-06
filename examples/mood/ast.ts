export type AstNode = FunctionDeclaration | Expression;
type Expression = Identifier | Literal | IfStatement | BinaryExpression;

type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Identifier[];
  public: boolean;
  body: Expression;
};

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
