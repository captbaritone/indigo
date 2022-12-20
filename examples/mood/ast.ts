import { Location } from "./Location";

export type AstNode = Program | Declaration | Expression | Parameter;
export type Expression =
  | Identifier
  | Literal
  | BinaryExpression
  | CallExpression
  | ExpressionPath
  | BlockExpression
  | VariableDeclaration
  | StructConstruction
  | MemberExpression
  | MatchExpression;

export type Program = {
  type: "Program";
  body: Declaration[];
  loc: Location;
};

export type MatchExpression = {
  type: "MatchExpression";
  value: Expression;
  cases: MatchCase[];
  loc: Location;
  nodeId: number;
};

export type MatchCase = {
  type: "MatchCase";
  pattern: MatchPattern;
  expression: Expression;
  loc: Location;
  nodeId: number;
};

export type MatchPattern = {
  type: "MatchPattern";
  head: Identifier;
  tail: Identifier;
  arg: Identifier | null;
  loc: Location;
};

export type Declaration =
  | FunctionDeclaration
  | EnumDeclaration
  | StructDeclaration;

export type FunctionDeclaration = {
  type: "FunctionDeclaration";
  id: Identifier;
  params: Parameter[];
  public: boolean;
  body: BlockExpression;
  returnType: TypeAnnotation;
  loc: Location;
  nodeId: number;
};

export type StructDeclaration = {
  type: "StructDeclaration";
  id: Identifier;
  fields: StructField[];
  loc: Location;
};

export type StructField = {
  type: "StructField";
  id: Identifier;
  annotation: TypeAnnotation;
  loc: Location;
};

export type BlockExpression = {
  type: "BlockExpression";
  expressions: Expression[];
  loc: Location;
  nodeId: number;
};

export type EnumDeclaration = {
  type: "EnumDeclaration";
  id: Identifier;
  variants: VariantDeclaration[];
  loc: Location;
};

export type VariantDeclaration = {
  type: "Variant";
  id: Identifier;
  valueType: TypeAnnotation | null;
  loc: Location;
};

export type Parameter = {
  type: "Parameter";
  name: Identifier;
  annotation: TypeAnnotation;
  loc: Location;
  nodeId: number;
};

export type NumericType = {
  type: "PrimitiveType";
  name: "f64" | "i32";
};

export type StructConstruction = {
  type: "StructConstruction";
  id: Identifier;
  fields: StructFieldConstruction[];
  loc: Location;
  nodeId: number;
};

export type StructFieldConstruction = {
  type: "StructFieldConstruction";
  name: Identifier;
  value: Expression;
  loc: Location;
  nodeId: number;
};

export type VariableDeclaration = {
  type: "VariableDeclaration";
  name: Identifier;
  value: Expression;
  annotation: TypeAnnotation;
  loc: Location;
  nodeId: number;
};

export type TypeAnnotation = Identifier;

export type Identifier = {
  type: "Identifier";
  name: string;
  loc: Location;
  nodeId: number;
};

export type Literal = {
  type: "Literal";
  value: any;
  annotation: TypeAnnotation;
  loc: Location;
  nodeId: number;
};

export type CallExpression = {
  type: "CallExpression";
  callee: Identifier;
  args: Expression[];
  loc: Location;
  nodeId: number;
};

export type ExpressionPath = {
  type: "ExpressionPath";
  head: Identifier;
  tail: Identifier | CallExpression;
  loc: Location;
  nodeId: number;
};

export type BinaryExpression = {
  type: "BinaryExpression";
  left: Expression;
  right: Expression;
  operator: "+" | "*" | "==";
  loc: Location;
  nodeId: number;
};

export type MemberExpression = {
  type: "MemberExpression";
  head: Identifier;
  tail: Identifier;
  loc: Location;
  nodeId: number;
};
