{
  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index));
  }
}

Start
  = Program

Program
  = functions:(Function __)* {
    return {
      type: 'Program',
      body: extractList(functions, 0)
    };
  }

CallExpression
  = callee:Identifier __ "(" __ args:ArgumentList __ ")" {
    return {
      type: 'CallExpression',
      callee: callee,
      args,
      loc: location()
    }
  }

ArgumentList
  = head:Expression tail:(__ "," __ Expression)* {
    return buildList(head, tail, 3);
  }

Function 
  = pub:PubToken? __ FnToken __ id:Identifier __ "(" params:ParameterList ")" __ ":" __ returnType:Type __ body:FunctionBody {
    return { type: "FunctionDeclaration", id, params, body, public: !!pub, returnType };
  }

FunctionBody 
  = "{" __ body:Expression __ "}" {
    return body;
  }

ParameterList
  = head:Parameter tail:(__ "," __ Parameter)* {
    return buildList(head, tail, 3);
  }
  / __ {
    return [];
  }

Parameter
  = name:Identifier __ ":" __ annotation:Type {
    return { type: "Parameter", name, annotation };
  }

NumericType = "f64" / "i32";
Type = NumericType;

Identifier
  = name:$(IdentStart IdentCont*) {
    return { type: "Identifier", name }
  }

Expression
  = CallExpression
  / Additive

Additive
  = left:Multiplicative __ operator:"+" __ right:Additive {
    return { type: "BinaryExpression", left, right, operator };
  }
  / Multiplicative

Multiplicative
  = left:Primary __ operator:"*" __ right:Multiplicative { 
    return { type: "BinaryExpression", left, right, operator };
  }
  / Primary

Primary
  = Integer
  / Identifier
  / "(" __ additive:Additive __ ")" { return additive; }

Integer "integer"
  = digits:[0-9]+ {
    return { type: "Literal", value: parseInt(digits.join(""), 10), annotation: "f64" };
  }

IdentStart
  = [a-zA-Z]

IdentCont
  = [a-zA-Z0-9]

// Tokens
PubToken        = "pub" !IdentStart;
FnToken         = "fn"  !IdentStart;

Whitespace
  = [ \t\r\n]+;
__
  = Whitespace*