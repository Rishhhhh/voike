export type FlowLiteral =
  | string
  | number
  | boolean
  | null
  | FlowLiteral[]
  | { [key: string]: FlowLiteral };

type Token =
  | { type: 'braceOpen' }
  | { type: 'braceClose' }
  | { type: 'bracketOpen' }
  | { type: 'bracketClose' }
  | { type: 'colon' }
  | { type: 'comma' }
  | { type: 'equals' }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'eof' };

export function parseFlowPayload(source: string): FlowLiteral {
  const tokenizer = new FlowTokenizer(source);
  tokenizer.skipWhitespace();
  const first = tokenizer.peek();
  if (!first || first.type === 'eof') {
    return {};
  }
  if (first.type === 'braceOpen' || first.type === 'bracketOpen') {
    return parseValue(tokenizer);
  }
  return parseAssignments(tokenizer);
}

function parseAssignments(tokenizer: FlowTokenizer): Record<string, FlowLiteral> {
  const result: Record<string, FlowLiteral> = {};
  while (true) {
    tokenizer.skipWhitespace();
    const keyToken = tokenizer.next();
    if (!keyToken || keyToken.type !== 'identifier') {
      break;
    }
    tokenizer.skipWhitespace();
    tokenizer.expect('equals');
    const value = parseValue(tokenizer);
    result[keyToken.value] = value;
    tokenizer.skipWhitespace();
    const peek = tokenizer.peek();
    if (peek?.type === 'comma') {
      tokenizer.next();
      continue;
    }
    break;
  }
  return result;
}

function parseValue(tokenizer: FlowTokenizer): FlowLiteral {
  tokenizer.skipWhitespace();
  const token = tokenizer.next();
  if (!token) {
    throw new Error('Unexpected end of payload');
  }
  switch (token.type) {
    case 'string':
      return token.value;
    case 'number':
      return token.value;
    case 'boolean':
      return token.value;
    case 'null':
      return null;
    case 'identifier':
      return token.value;
    case 'braceOpen':
      return parseObject(tokenizer);
    case 'bracketOpen':
      return parseArray(tokenizer);
    default:
      throw new Error(`Unexpected token ${token.type}`);
  }
}

function parseObject(tokenizer: FlowTokenizer): Record<string, FlowLiteral> {
  const result: Record<string, FlowLiteral> = {};
  tokenizer.skipWhitespace();
  while (true) {
    const nextToken = tokenizer.peek();
    if (!nextToken) {
      throw new Error('Unterminated object literal');
    }
    if (nextToken.type === 'braceClose') {
      tokenizer.next();
      break;
    }
    const keyToken = tokenizer.next();
    if (!keyToken || (keyToken.type !== 'string' && keyToken.type !== 'identifier')) {
      throw new Error('Object keys must be identifiers or string literals');
    }
    const key = keyToken.type === 'string' ? keyToken.value : keyToken.value;
    tokenizer.skipWhitespace();
    tokenizer.expect('colon');
    const value = parseValue(tokenizer);
    result[key] = value;
    tokenizer.skipWhitespace();
    const delimiter = tokenizer.peek();
    if (delimiter?.type === 'comma') {
      tokenizer.next();
      tokenizer.skipWhitespace();
      continue;
    }
    if (delimiter?.type === 'braceClose') {
      tokenizer.next();
      break;
    }
    if (delimiter?.type === 'eof') {
      break;
    }
  }
  return result;
}

function parseArray(tokenizer: FlowTokenizer): FlowLiteral[] {
  const result: FlowLiteral[] = [];
  tokenizer.skipWhitespace();
  while (true) {
    const nextToken = tokenizer.peek();
    if (!nextToken) {
      throw new Error('Unterminated array literal');
    }
    if (nextToken.type === 'bracketClose') {
      tokenizer.next();
      break;
    }
    const value = parseValue(tokenizer);
    result.push(value);
    tokenizer.skipWhitespace();
    const delimiter = tokenizer.peek();
    if (delimiter?.type === 'comma') {
      tokenizer.next();
      tokenizer.skipWhitespace();
      continue;
    }
    if (delimiter?.type === 'bracketClose') {
      tokenizer.next();
      break;
    }
    if (delimiter?.type === 'eof') {
      break;
    }
  }
  return result;
}

class FlowTokenizer {
  private index = 0;
  constructor(private readonly source: string) {}

  peek(): Token | null {
    const saved = this.index;
    const token = this.next();
    this.index = saved;
    return token;
  }

  next(): Token | null {
    this.skipWhitespace();
    if (this.index >= this.source.length) {
      return { type: 'eof' };
    }
    const char = this.source[this.index];
    switch (char) {
      case '{':
        this.index += 1;
        return { type: 'braceOpen' };
      case '}':
        this.index += 1;
        return { type: 'braceClose' };
      case '[':
        this.index += 1;
        return { type: 'bracketOpen' };
      case ']':
        this.index += 1;
        return { type: 'bracketClose' };
      case ':':
        this.index += 1;
        return { type: 'colon' };
      case ',':
        this.index += 1;
        return { type: 'comma' };
      case '=':
        this.index += 1;
        return { type: 'equals' };
      case '"':
      case "'":
        return this.readString(char);
      default:
        if (this.isDigit(char) || (char === '-' && this.isDigit(this.source[this.index + 1]))) {
          return this.readNumber();
        }
        if (this.isIdentifierStart(char)) {
          return this.readIdentifier();
        }
        this.index += 1;
        return this.next();
    }
  }

  expect(type: Token['type']) {
    const token = this.next();
    if (!token || token.type !== type) {
      throw new Error(`Expected token ${type}, received ${token?.type}`);
    }
  }

  skipWhitespace() {
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
        this.index += 1;
        continue;
      }
      if (char === '/' && this.source[this.index + 1] === '/') {
        this.index += 2;
        while (this.index < this.source.length && this.source[this.index] !== '\n') {
          this.index += 1;
        }
        continue;
      }
      break;
    }
  }

  private readString(quote: string): Token {
    this.index += 1;
    let value = '';
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '\\' && this.source[this.index + 1]) {
        value += this.source[this.index + 1];
        this.index += 2;
        continue;
      }
      if (char === quote) {
        this.index += 1;
        return { type: 'string', value };
      }
      value += char;
      this.index += 1;
    }
    throw new Error('Unterminated string literal');
  }

  private readNumber(): Token {
    const start = this.index;
    if (this.source[this.index] === '-') {
      this.index += 1;
    }
    while (this.index < this.source.length && this.isDigit(this.source[this.index])) {
      this.index += 1;
    }
    if (this.source[this.index] === '.' && this.isDigit(this.source[this.index + 1])) {
      this.index += 1;
      while (this.index < this.source.length && this.isDigit(this.source[this.index])) {
        this.index += 1;
      }
    }
    const raw = this.source.slice(start, this.index);
    return { type: 'number', value: Number(raw) };
  }

  private readIdentifier(): Token {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length && this.isIdentifierPart(this.source[this.index])) {
      this.index += 1;
    }
    const raw = this.source.slice(start, this.index);
    if (raw === 'true') return { type: 'boolean', value: true };
    if (raw === 'false') return { type: 'boolean', value: false };
    if (raw === 'null') return { type: 'null' };
    return { type: 'identifier', value: raw };
  }

  private isDigit(char: string | undefined) {
    return !!char && char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string | undefined) {
    if (!char) return false;
    return /[A-Za-z_]/.test(char);
  }

  private isIdentifierPart(char: string | undefined) {
    if (!char) return false;
    return /[A-Za-z0-9_\-.\[\]]/.test(char);
  }
}
