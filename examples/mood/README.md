# Mood Lang

Mood, (codename, real name TBD) is a toy language with a goal of being self-hosted. The syntax is mostly borrowed from Rust, it is strongly typed, and compiles directly to WebAssembly. It is intended for environments where you would like to support user-defined code that runs in the browser. This gives us an excuse to have a very light weight compiler, since the compiler will need to be loaded in the browser.

## TODO

Keeping track of the many many things still needed to be done:

- Ensure public functions can only return numbers
  - Maybe in the future we can support a js bridge but for now
    support returning numbers.
- Conditionals
- Loops
- Two pass type checking (check top level declarations first to support recursive types)
- Go back and word-smith error messages, especially the text attached to locations
- Arrays
    - More generally, we need to figure out how to model heap allocated data
- Structs
- Define a canonical ordering for AST nodes for use in:
    - Grammar
    - AstNode types
    - TypeChecker
    - Compiler
- Optimize statements (`exp;`) to not push a value on the stack.


## TODO Projects

Larger optional projects that would be nice to have:

- Implement an LSP server
- Syntax highlighting (could we use tree sitter for this?)

