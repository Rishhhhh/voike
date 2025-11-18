import { VasmOpcode, type VasmProgram } from '@vasm/program';
import { VasmVM } from '@vasm/vm';

describe('VasmVM', () => {
  it('runs arithmetic and stores result in r0', () => {
    const program: VasmProgram = {
      instructions: [
        { op: VasmOpcode.LOAD_CONST, args: ['r1', 2] },
        { op: VasmOpcode.LOAD_CONST, args: ['r2', 3] },
        { op: VasmOpcode.ADD, args: ['r0', 'r1', 'r2'] },
        { op: VasmOpcode.HALT },
      ],
    };
    const vm = new VasmVM(program).run();
    expect(vm.getRegister('r0')).toBe(5);
  });

  it('supports branching with JIF and JMP', () => {
    const program: VasmProgram = {
      instructions: [
        { op: VasmOpcode.LOAD_CONST, args: ['r1', 0] },
        { op: VasmOpcode.LOAD_CONST, args: ['r2', 5] },
        { op: VasmOpcode.LOAD_CONST, args: ['r3', 1] },
        { label: 'loop_start', op: VasmOpcode.CMPLT, args: ['r4', 'r1', 'r2'] },
        { op: VasmOpcode.JIF, args: ['r4', 'body'] },
        { op: VasmOpcode.JMP, args: ['done'] },
        { label: 'body', op: VasmOpcode.ADD, args: ['r0', 'r0', 'r1'] },
        { op: VasmOpcode.ADD, args: ['r1', 'r1', 'r3'] },
        { op: VasmOpcode.JMP, args: ['loop_start'] },
        { label: 'done', op: VasmOpcode.HALT },
      ],
    };
    const vm = new VasmVM(program).run();
    expect(vm.getRegister('r0')).toBe(0 + 1 + 2 + 3 + 4);
  });
});
