{
  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index));
  }
}

Start
  = Function

Function 
  = pub:PubToken? __ FnToken __ id:Identifier __ "(" params:ParameterList? ")" __ body:FunctionBody {
    return { type: "FunctionDeclaration", id, params, body, public: !!pub };
  }

FunctionBody 
  = "{" __ body:Expression __ "}" {
    return body;
  }

ParameterList
  = head:Identifier tail:(__ "," __ Identifier)* {
    return buildList(head, tail, 3);
  }

Identifier
  = name:$(IdentStart IdentCont*) {
    return { type: "Identifier", name }
  }

Expression
 = Additive

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
    return { type: "Literal", value: parseInt(digits.join(""), 10) };
  }

IdentStart
  = [a-zA-Z]

IdentCont
  = [a-zA-Z0-9]

// Tokens
PubToken        = "pub" !IdentStart;
FnToken         = "fn"  !IdentStart;

__
  = " "*
