import { Location } from "./ast";

export class AnnotatedLocation {
  loc: Location;
  annotation: string;

  constructor(loc: Location, annotation: string) {
    this.loc = loc;
    this.annotation = annotation;
  }
}

export function annotate(loc: Location, annotation: string) {
  return new AnnotatedLocation(loc, annotation);
}

export default class DiagnosticError extends Error {
  loc: AnnotatedLocation;
  related: AnnotatedLocation[];
  constructor(
    message: string,
    loc: AnnotatedLocation,
    related: AnnotatedLocation[] = [],
  ) {
    super(message);
    this.loc = loc;
    this.related = related;
  }

  // Prints a diagnostic message with code frame to the console.
  reportDiagnostic(source: string) {
    const lines = source.split("\n");
    const location = this.loc.loc;
    const startLine = Math.max(location.start.line - 2, 0);
    const endLine = Math.min(location.end.line, lines.length - 1);

    if (location.start.line !== location.end.line) {
      throw new Error("TODO: Multi-line error reporting");
    }

    const gutter = String(endLine).length;
    const defaultGutter = " ".repeat(gutter) + " | ";

    const fileLocation = `<dummy file name>:${location.start.line}:${location.start.column}`;

    const codeFrameLines: string[] = [
      `Error: ${this.message}:`,
      ` --> ${fileLocation}`,
      "",
    ];

    for (const [i, line] of lines.entries()) {
      if (i >= startLine && i <= endLine) {
        let linePrefix = defaultGutter;
        if (i >= location.start.line - 1 && i <= location.end.line - 1) {
          const lineNumber = String(i + 1);
          const lineNumberPadding = " ".repeat(gutter - lineNumber.length);
          linePrefix = `${lineNumberPadding}${lineNumber} | `;
        }
        codeFrameLines.push(`${linePrefix}${line}`);
        // Underline the error
        if (i === location.start.line - 1) {
          const start = location.start.column - 1;
          const end = location.end.column - 1;
          const underline =
            defaultGutter +
            " ".repeat(start) +
            "^".repeat(end - start) +
            " " +
            this.loc.annotation;
          codeFrameLines.push(underline);
        }
      }
    }

    codeFrameLines.push("");

    const codeFrame = codeFrameLines.join("\n");
    console.error(codeFrame);
  }
}
