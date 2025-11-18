import { VasmOpcode, type Operand, type RegisterName, type VasmInstruction, type VasmProgram } from './program';

type SyscallHandler = (vm: VasmVM, args: Operand[] | undefined) => void;

const DEFAULT_SYSCALLS: Partial<Record<VasmOpcode, SyscallHandler>> = {
  [VasmOpcode.PRINT]: (vm, args) => {
    const reg = args?.[0] as RegisterName;
    // eslint-disable-next-line no-console
    console.log(vm.getRegister(reg));
  },
  [VasmOpcode.NOW]: (vm, args) => {
    const reg = args?.[0] as RegisterName;
    vm.setRegister(reg, Date.now());
  },
  [VasmOpcode.VOIKE_QUERY]: noopSyscall('VOIKE_QUERY'),
  [VasmOpcode.VOIKE_BLOB]: noopSyscall('VOIKE_BLOB'),
  [VasmOpcode.VOIKE_GRID_JOB]: noopSyscall('VOIKE_GRID_JOB'),
  [VasmOpcode.VOIKE_AI_ASK]: noopSyscall('VOIKE_AI_ASK'),
  [VasmOpcode.VOIKE_RUN_JOB]: noopSyscall('VOIKE_RUN_JOB'),
};

function noopSyscall(name: string): SyscallHandler {
  return (vm) => {
    vm.debugMessages.push(`${name} syscall invoked (stub)`);
  };
}

export class VasmVM {
  private registers: number[] = new Array(8).fill(0);
  private stack: number[] = [];
  private pc = 0;
  private running = true;
  private readonly labelMap = new Map<string, number>();
  readonly debugMessages: string[] = [];

  constructor(private readonly program: VasmProgram, private readonly syscalls: Partial<Record<VasmOpcode, SyscallHandler>> = {}) {
    program.instructions.forEach((instr, idx) => {
      if (instr.label) {
        this.labelMap.set(instr.label, idx);
      }
    });
  }

  run() {
    const { instructions } = this.program;
    this.pc = 0;
    this.running = true;
    while (this.running && this.pc < instructions.length) {
      const instruction = instructions[this.pc];
      this.execute(instruction);
      this.pc += 1;
    }
    return this;
  }

  getRegister(name: RegisterName): number {
    return this.registers[this.registerIndex(name)];
  }

  setRegister(name: RegisterName, value: number) {
    this.registers[this.registerIndex(name)] = value;
  }

  private execute(instruction: VasmInstruction) {
    const { op, args } = instruction;
    switch (op) {
      case VasmOpcode.LOAD_CONST:
        this.handleLoadConst(args);
        break;
      case VasmOpcode.MOV:
        this.handleMov(args);
        break;
      case VasmOpcode.PUSH:
        this.stack.push(this.getRegister(args?.[0] as RegisterName));
        break;
      case VasmOpcode.POP: {
        if (this.stack.length === 0) {
          throw new Error("Stack underflow: attempted to POP from an empty stack");
        }
        const value = this.stack.pop()!;
        this.setRegister(args?.[0] as RegisterName, value);
        break;
      }
      case VasmOpcode.ADD:
      case VasmOpcode.SUB:
      case VasmOpcode.MUL:
      case VasmOpcode.DIV:
      case VasmOpcode.MOD:
        this.handleArithmetic(op, args);
        break;
      case VasmOpcode.INC:
        this.increment(args?.[0] as RegisterName, 1);
        break;
      case VasmOpcode.DEC:
        this.increment(args?.[0] as RegisterName, -1);
        break;
      case VasmOpcode.CMPLT:
      case VasmOpcode.CMPLE:
      case VasmOpcode.CMPEQ:
      case VasmOpcode.CMPNE:
        this.handleComparison(op, args);
        break;
      case VasmOpcode.AND:
      case VasmOpcode.OR:
      case VasmOpcode.NOT:
        this.handleBoolean(op, args);
        break;
      case VasmOpcode.JMP:
        this.jump(args?.[0]);
        break;
      case VasmOpcode.JIF:
        this.jumpIf(args);
        break;
      case VasmOpcode.CALL:
        this.call(args?.[0]);
        break;
      case VasmOpcode.RET:
        this.ret();
        break;
      case VasmOpcode.HALT:
        this.running = false;
        break;
      default:
        this.handleSyscall(op, args);
        break;
    }
  }

  private handleLoadConst(args?: Operand[]) {
    const [reg, value] = args || [];
    this.setRegister(reg as RegisterName, Number(value));
  }

  private handleMov(args?: Operand[]) {
    const [dest, src] = args || [];
    this.setRegister(dest as RegisterName, this.getRegister(src as RegisterName));
  }

  private handleArithmetic(op: VasmOpcode, args?: Operand[]) {
    const [dest, left, right] = args || [];
    const a = this.getRegister(left as RegisterName);
    const b = this.getRegister(right as RegisterName);
    let result = 0;
    switch (op) {
      case VasmOpcode.ADD:
        result = a + b;
        break;
      case VasmOpcode.SUB:
        result = a - b;
        break;
      case VasmOpcode.MUL:
        result = a * b;
        break;
      case VasmOpcode.DIV:
        if (b === 0) {
          throw new Error("Division by zero");
        }
        if (b === 0) {
          throw new Error("Modulo by zero");
        }
        result = a % b;
        break;
      case VasmOpcode.MOD:
        if (b === 0) {
          throw new Error("Modulo by zero");
        }
        result = a % b;
        break;
      default:
        break;
    }
    this.setRegister(dest as RegisterName, result);
  }

  private increment(register: RegisterName, delta: number) {
    const current = this.getRegister(register);
    this.setRegister(register, current + delta);
  }

  private handleComparison(op: VasmOpcode, args?: Operand[]) {
    const [dest, left, right] = args || [];
    const a = this.getRegister(left as RegisterName);
    const b = this.getRegister(right as RegisterName);
    let result = 0;
    switch (op) {
      case VasmOpcode.CMPLT:
        result = a < b ? 1 : 0;
        break;
      case VasmOpcode.CMPLE:
        result = a <= b ? 1 : 0;
        break;
      case VasmOpcode.CMPEQ:
        result = a === b ? 1 : 0;
        break;
      case VasmOpcode.CMPNE:
        result = a !== b ? 1 : 0;
        break;
      default:
        break;
    }
    this.setRegister(dest as RegisterName, result);
  }

  private handleBoolean(op: VasmOpcode, args?: Operand[]) {
    const [dest, left, right] = args || [];
    const a = this.getRegister(left as RegisterName);
    const b = right ? this.getRegister(right as RegisterName) : 0;
    let result = 0;
    switch (op) {
      case VasmOpcode.AND:
        result = a !== 0 && b !== 0 ? 1 : 0;
        break;
      case VasmOpcode.OR:
        result = a !== 0 || b !== 0 ? 1 : 0;
        break;
      case VasmOpcode.NOT:
        result = a === 0 ? 1 : 0;
        break;
      default:
        break;
    }
    this.setRegister(dest as RegisterName, result);
  }

  private jump(target?: Operand) {
    const address = this.resolveJumpTarget(target);
    if (address !== undefined) {
      this.pc = address - 1; // -1 because main loop increments after execution
    }
  }

  private jumpIf(args?: Operand[]) {
    const [condReg, target] = args || [];
    const condition = this.getRegister(condReg as RegisterName);
    if (condition !== 0) {
      this.jump(target);
    }
  }
      throw new Error("Stack underflow on RET");
    const address = this.resolveJumpTarget(target);
    if (address !== undefined) {
      this.stack.push(this.pc + 1);
      this.pc = address - 1;
    }
  }

  private ret() {
    const address = this.stack.pop();
    if (address === undefined) {
      this.running = false;
      return;
    }
    this.pc = address - 1;
  }

  private handleSyscall(op: VasmOpcode, args?: Operand[]) {
    const handler = this.syscalls[op] || DEFAULT_SYSCALLS[op];
    if (!handler) {
      throw new Error(`No syscall handler for ${op}`);
    }
    handler(this, args);
  }

  private resolveJumpTarget(target?: Operand): number | undefined {
    if (typeof target === 'number') {
      return target;
    }
    if (typeof target === 'string') {
      if (target.startsWith('r')) {
        return this.getRegister(target as RegisterName);
      }
      const labelAddress = this.labelMap.get(target);
      if (labelAddress === undefined) {
        throw new Error(`Unknown label: ${target}`);
      }
      return labelAddress;
    }
    return undefined;
  }

  private registerIndex(name: RegisterName): number {
    const idx = Number(name.substring(1));
    if (Number.isNaN(idx) || idx < 0 || idx > 7) {
      throw new Error(`Invalid register: ${name}`);
    }
    return idx;
  }
}
