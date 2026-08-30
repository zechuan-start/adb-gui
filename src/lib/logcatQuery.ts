import { RE2JS } from "re2js";
import { LEVELS, type LogcatEntry, type LogLevel } from "@/lib/logcat";

export type QueryKey = "tag" | "message" | "level" | "package" | "process" | "is";
export type QueryModifier = "regex" | "exact" | null;
export type QueryIsKind = "crash" | "stacktrace";

export const QUERY_KEYS: readonly QueryKey[] = [
  "tag",
  "message",
  "level",
  "package",
  "process",
  "is",
];
export const QUERY_LEVEL_VALUES: readonly string[] = [
  "VERBOSE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "ASSERT",
];
export const QUERY_IS_VALUES: readonly QueryIsKind[] = ["crash", "stacktrace"];
export const MAX_QUERY_LENGTH = 4_096;
export const MAX_QUERY_NESTING = 64;

export const LEVEL_NAMES: Readonly<Record<string, LogLevel>> = {
  VERBOSE: "V",
  DEBUG: "D",
  INFO: "I",
  WARN: "W",
  ERROR: "E",
  ASSERT: "F",
  V: "V",
  D: "D",
  I: "I",
  W: "W",
  E: "E",
  F: "F",
};

const SYMBOL_KINDS: Readonly<Record<string, SymbolTokenKind>> = {
  "&": "and",
  "|": "or",
  "-": "not",
  "(": "lparen",
  ")": "rparen",
};
const WHITESPACE = /\s/;
const KEY_NAME_CHARACTER = /[A-Za-z0-9_-]/;

export type Matcher =
  | { kind: "contains"; lowered: string }
  | { kind: "exact"; value: string }
  | { kind: "regex"; regex: RE2JS };

export type QueryNode =
  | { type: "and"; children: QueryNode[] }
  | { type: "or"; children: QueryNode[] }
  | { type: "not"; child: QueryNode }
  | { type: "tag"; match: Matcher }
  | { type: "message"; match: Matcher }
  | { type: "process"; match: Matcher }
  | { type: "level"; min: LogLevel }
  | { type: "package"; name: string }
  | { type: "is"; kind: QueryIsKind }
  | { type: "always" };

export interface CompileSuccess {
  ok: true;
  ast: QueryNode;
  packageRefs: string[];
  processRefs: string[];
  tagRefs: string[];
}

export interface CompileFailure {
  ok: false;
  message: string;
  start: number;
  end: number;
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface EvalContext {
  currentPackage: string;
}

type SymbolTokenKind = "and" | "or" | "not" | "lparen" | "rparen" | "eof";

interface SymbolToken {
  kind: SymbolTokenKind;
  start: number;
  end: number;
}

interface TextToken {
  kind: "text";
  start: number;
  end: number;
  text: string;
}

interface KeyToken {
  kind: "key";
  start: number;
  end: number;
  key: QueryKey;
  modifier: QueryModifier;
  modifierStart: number | null;
  value: string;
  valueStart: number;
  valueEnd: number;
}

type Token = SymbolToken | TextToken | KeyToken;

interface TokenizeSuccess {
  ok: true;
  tokens: Token[];
}

type TokenizeResult = TokenizeSuccess | CompileFailure;

class QuerySyntaxError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
  }
}

function failure(message: string, start: number, end: number): CompileFailure {
  return { ok: false, message, start, end };
}

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

function isTermBoundary(char: string): boolean {
  return (
    isWhitespace(char) ||
    char === "&" ||
    char === "|" ||
    char === "-" ||
    char === "(" ||
    char === ")"
  );
}

function findQueryKey(value: string): QueryKey | null {
  return QUERY_KEYS.find((key) => key === value) ?? null;
}

function tokenizeKey(input: string, start: number, nameEnd: number): TokenizeResult | null {
  let cursor = nameEnd;
  let modifier: QueryModifier = null;
  let modifierStart: number | null = null;

  if (input[cursor] === "~" || input[cursor] === "=") {
    modifierStart = cursor;
    modifier = input[cursor] === "~" ? "regex" : "exact";
    cursor += 1;
  }
  if (input[cursor] !== ":") {
    return null;
  }

  const keyName = input.slice(start, nameEnd);
  const key = findQueryKey(keyName);
  if (key === null) {
    return failure(`未知查询键: ${keyName}`, start, nameEnd);
  }

  cursor += 1;
  if (cursor >= input.length || isTermBoundary(input[cursor])) {
    return failure(`查询键 ${keyName}: 缺少值`, cursor, cursor);
  }

  let value = "";
  let valueStart = cursor;
  let valueEnd = cursor;

  if (input[cursor] === '"') {
    const quoteStart = cursor;
    cursor += 1;
    valueStart = cursor;
    let closed = false;
    while (cursor < input.length) {
      const char = input[cursor];
      if (char === '"') {
        valueEnd = cursor;
        cursor += 1;
        closed = true;
        break;
      }
      if (char === "\\") {
        const next = input[cursor + 1];
        if (next === '"' || next === "\\") {
          value += next;
          cursor += 2;
          continue;
        }
        value += "\\";
        cursor += 1;
        continue;
      }
      value += char;
      cursor += 1;
    }
    if (!closed) {
      return failure("引号未闭合", quoteStart, input.length);
    }
    if (value.length === 0) {
      return failure(`查询键 ${keyName}: 缺少值`, valueStart, valueEnd);
    }
    if (cursor < input.length && !isTermBoundary(input[cursor])) {
      return failure("引号值后存在意外字符", cursor, cursor + 1);
    }
  } else {
    while (cursor < input.length && !isTermBoundary(input[cursor])) {
      const char = input[cursor];
      if (char === '"') {
        return failure("引号必须包裹完整的查询值", cursor, cursor + 1);
      }
      value += char === "\\" ? " " : char;
      cursor += 1;
    }
    valueEnd = cursor;
  }

  return {
    ok: true,
    tokens: [
      {
        kind: "key",
        start,
        end: cursor,
        key,
        modifier,
        modifierStart,
        value,
        valueStart,
        valueEnd,
      },
    ],
  };
}

function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];
    if (isWhitespace(char)) {
      cursor += 1;
      continue;
    }

    const symbolKind = SYMBOL_KINDS[char];
    if (symbolKind !== undefined) {
      tokens.push({ kind: symbolKind, start: cursor, end: cursor + 1 });
      cursor += 1;
      continue;
    }

    const start = cursor;
    while (cursor < input.length && KEY_NAME_CHARACTER.test(input[cursor])) {
      cursor += 1;
    }
    if (cursor > start) {
      const keyResult = tokenizeKey(input, start, cursor);
      if (keyResult !== null) {
        if (!keyResult.ok) {
          return keyResult;
        }
        tokens.push(keyResult.tokens[0]);
        cursor = keyResult.tokens[0].end;
        continue;
      }
    }

    cursor = start;
    let text = "";
    while (cursor < input.length && !isTermBoundary(input[cursor])) {
      const textChar = input[cursor];
      if (textChar === '"') {
        return failure("裸文本不支持引号, 请使用 message:\"...\"", cursor, cursor + 1);
      }
      text += textChar === "\\" ? " " : textChar;
      cursor += 1;
    }
    if (text.length === 0) {
      return failure("无法识别查询内容", start, Math.min(start + 1, input.length));
    }
    tokens.push({ kind: "text", start, end: cursor, text });
  }

  tokens.push({ kind: "eof", start: input.length, end: input.length });
  return { ok: true, tokens };
}

function createMatcher(token: KeyToken | TextToken): Matcher {
  const value = token.kind === "key" ? token.value : token.text;
  const modifier = token.kind === "key" ? token.modifier : null;
  if (modifier === "exact") {
    return { kind: "exact", value };
  }
  if (modifier === "regex") {
    try {
      return { kind: "regex", regex: RE2JS.compile(value) };
    } catch {
      const start = token.kind === "key" ? token.valueStart : token.start;
      const end = token.kind === "key" ? token.valueEnd : token.end;
      throw new QuerySyntaxError("无效的正则表达式", start, end);
    }
  }
  return { kind: "contains", lowered: value.toLowerCase() };
}

function assertNoModifier(token: KeyToken): void {
  if (token.modifier === null) {
    return;
  }
  const name = token.modifier === "regex" ? "正则" : "精确";
  const start = token.modifierStart ?? token.start;
  throw new QuerySyntaxError(`${token.key}: 不支持${name}修饰符`, start, start + 1);
}

class Parser {
  private index = 0;
  private nesting = 0;
  private readonly packageRefs = new Set<string>();
  private readonly processRefs = new Set<string>();
  private readonly tagRefs = new Set<string>();

  constructor(private readonly tokens: Token[]) {}

  parse(): CompileSuccess {
    if (this.current().kind === "eof") {
      return {
        ok: true,
        ast: { type: "always" },
        packageRefs: [],
        processRefs: [],
        tagRefs: [],
      };
    }

    const ast = this.parseOr();
    const trailing = this.current();
    if (trailing.kind !== "eof") {
      const message = trailing.kind === "rparen" ? "多余的右括号" : "查询末尾存在意外内容";
      throw new QuerySyntaxError(message, trailing.start, trailing.end);
    }
    return {
      ok: true,
      ast,
      packageRefs: Array.from(this.packageRefs),
      processRefs: Array.from(this.processRefs),
      tagRefs: Array.from(this.tagRefs),
    };
  }

  private parseOr(): QueryNode {
    const children: QueryNode[] = [this.parseAnd()];
    while (this.current().kind === "or") {
      const operator = this.advance();
      if (!this.canStartUnary(this.current())) {
        throw new QuerySyntaxError("运算符 | 后缺少表达式", operator.start, operator.end);
      }
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  private parseAnd(): QueryNode {
    const children: QueryNode[] = [this.parseUnary()];
    while (true) {
      if (this.current().kind === "and") {
        const operator = this.advance();
        if (!this.canStartUnary(this.current())) {
          throw new QuerySyntaxError("运算符 & 后缺少表达式", operator.start, operator.end);
        }
        children.push(this.parseUnary());
        continue;
      }
      if (this.canStartUnary(this.current())) {
        children.push(this.parseUnary());
        continue;
      }
      break;
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  private parseUnary(): QueryNode {
    if (this.current().kind !== "not") {
      return this.parsePrimary();
    }
    const operator = this.advance();
    if (!this.canStartUnary(this.current())) {
      throw new QuerySyntaxError("否定符后缺少表达式", operator.start, operator.end);
    }
    this.enterNesting(operator);
    try {
      return { type: "not", child: this.parseUnary() };
    } finally {
      this.nesting -= 1;
    }
  }

  private parsePrimary(): QueryNode {
    const token = this.current();
    if (token.kind === "lparen") {
      const opening = this.advance();
      if (this.current().kind === "rparen") {
        const closing = this.current();
        throw new QuerySyntaxError("括号内缺少表达式", closing.start, closing.end);
      }
      if (this.current().kind === "eof") {
        throw new QuerySyntaxError("缺少右括号", opening.start, opening.end);
      }
      this.enterNesting(opening);
      try {
        const child = this.parseOr();
        if (this.current().kind !== "rparen") {
          throw new QuerySyntaxError("缺少右括号", opening.start, opening.end);
        }
        this.advance();
        return child;
      } finally {
        this.nesting -= 1;
      }
    }
    if (token.kind === "text") {
      this.advance();
      return { type: "message", match: createMatcher(token) };
    }
    if (token.kind === "key") {
      this.advance();
      return this.parseKey(token);
    }
    throw new QuerySyntaxError("此处需要查询条件", token.start, token.end);
  }

  private parseKey(token: KeyToken): QueryNode {
    switch (token.key) {
      case "tag":
        this.tagRefs.add(token.value);
        return { type: "tag", match: createMatcher(token) };
      case "message":
        return { type: "message", match: createMatcher(token) };
      case "process":
        this.processRefs.add(token.value);
        return { type: "process", match: createMatcher(token) };
      case "level": {
        assertNoModifier(token);
        const min = LEVEL_NAMES[token.value.toUpperCase()];
        if (min === undefined) {
          throw new QuerySyntaxError(`未知日志等级: ${token.value}`, token.valueStart, token.valueEnd);
        }
        return { type: "level", min };
      }
      case "package":
        assertNoModifier(token);
        this.packageRefs.add(token.value);
        return { type: "package", name: token.value };
      case "is": {
        assertNoModifier(token);
        const lowered = token.value.toLowerCase();
        const kind = QUERY_IS_VALUES.find((value) => value === lowered);
        if (kind === undefined) {
          throw new QuerySyntaxError(`未知 is: 值: ${token.value}`, token.valueStart, token.valueEnd);
        }
        return { type: "is", kind };
      }
    }
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    const token = this.current();
    this.index += 1;
    return token;
  }

  private canStartUnary(token: Token): boolean {
    return token.kind === "not" || token.kind === "lparen" || token.kind === "key" || token.kind === "text";
  }

  private enterNesting(token: Token): void {
    if (this.nesting >= MAX_QUERY_NESTING) {
      throw new QuerySyntaxError(
        `查询嵌套不能超过 ${MAX_QUERY_NESTING} 层`,
        token.start,
        token.end,
      );
    }
    this.nesting += 1;
  }
}

export function compileQuery(input: string): CompileResult {
  if (input.length > MAX_QUERY_LENGTH) {
    return failure(
      `查询长度不能超过 ${MAX_QUERY_LENGTH} 个字符`,
      MAX_QUERY_LENGTH,
      input.length,
    );
  }
  const tokenized = tokenize(input);
  if (!tokenized.ok) {
    return tokenized;
  }
  try {
    return new Parser(tokenized.tokens).parse();
  } catch (error: unknown) {
    if (error instanceof QuerySyntaxError) {
      return failure(error.message, error.start, error.end);
    }
    throw error;
  }
}

export function formatQueryValue(value: string): string {
  if (value.length === 0) {
    throw new RangeError("Query values must not be empty");
  }
  let needsQuotes = false;
  let escaped = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (isTermBoundary(char) || char === '"' || char === "\\") {
      needsQuotes = true;
    }
    if (char === '"' || char === "\\") {
      escaped += "\\";
    }
    escaped += char;
  }
  return needsQuotes ? `"${escaped}"` : value;
}

export function formatRegexQueryValue(value: string): string {
  return formatQueryValue(RE2JS.quote(value));
}

function evaluateMatcher(entry: LogcatEntry, field: "tag" | "message", matcher: Matcher): boolean {
  switch (matcher.kind) {
    case "exact":
      return entry[field] === matcher.value;
    case "regex":
      return matcher.regex.test(entry[field]);
    case "contains": {
      const boundary = entry.searchKey.indexOf("\u0000");
      if (boundary < 0) {
        return false;
      }
      if (field === "tag") {
        const index = entry.searchKey.indexOf(matcher.lowered);
        return index >= 0 && index + matcher.lowered.length <= boundary;
      }
      return entry.searchKey.indexOf(matcher.lowered, boundary + 1) >= 0;
    }
  }
}

function evaluateNullableMatcher(value: string | null, matcher: Matcher): boolean {
  if (value === null) {
    return false;
  }
  switch (matcher.kind) {
    case "exact":
      return value === matcher.value;
    case "regex":
      return matcher.regex.test(value);
    case "contains":
      return value.toLowerCase().includes(matcher.lowered);
  }
}

export function evaluate(entry: LogcatEntry, ast: QueryNode, ctx: EvalContext): boolean {
  switch (ast.type) {
    case "always":
      return true;
    case "and":
      for (let index = 0; index < ast.children.length; index += 1) {
        if (!evaluate(entry, ast.children[index], ctx)) {
          return false;
        }
      }
      return true;
    case "or":
      for (let index = 0; index < ast.children.length; index += 1) {
        if (evaluate(entry, ast.children[index], ctx)) {
          return true;
        }
      }
      return false;
    case "not":
      return !evaluate(entry, ast.child, ctx);
    case "tag":
      return evaluateMatcher(entry, "tag", ast.match);
    case "message":
      return evaluateMatcher(entry, "message", ast.match);
    case "process":
      return evaluateNullableMatcher(entry.processName, ast.match);
    case "level":
      return LEVELS.indexOf(entry.level) >= LEVELS.indexOf(ast.min);
    case "package": {
      const packageName = ast.name === "mine" ? ctx.currentPackage : ast.name;
      return packageName.length > 0 && entry.packageName === packageName;
    }
    case "is":
      return entry.crashKind === ast.kind;
  }
}
