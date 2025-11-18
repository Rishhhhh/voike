export type RegisterName = `r${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;

export enum VasmOpcode {
  LOAD_CONST = 'LOAD_CONST',
  MOV = 'MOV',
  PUSH = 'PUSH',
  POP = 'POP',
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  MOD = 'MOD',
  INC = 'INC',
  DEC = 'DEC',
  CMPLT = 'CMPLT',
  CMPLE = 'CMPLE',
  CMPEQ = 'CMPEQ',
  CMPNE = 'CMPNE',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  JMP = 'JMP',
  JIF = 'JIF',
  CALL = 'CALL',
  RET = 'RET',
  HALT = 'HALT',
  PRINT = 'PRINT',
  NOW = 'NOW',
  VOIKE_QUERY = 'VOIKE_QUERY',
  VOIKE_BLOB = 'VOIKE_BLOB',
  VOIKE_GRID_JOB = 'VOIKE_GRID_JOB',
  VOIKE_AI_ASK = 'VOIKE_AI_ASK',
  VOIKE_RUN_JOB = 'VOIKE_RUN_JOB',
}

export type Operand = RegisterName | number | string;

export interface VasmInstruction {
  op: VasmOpcode;
  args?: Operand[];
  label?: string;
}

export interface VasmProgram {
  instructions: VasmInstruction[];
}
