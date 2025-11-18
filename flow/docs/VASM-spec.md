# VASM Specification (v0.1)

VASM is VOIKE's low-level, architecture-independent instruction set. It underpins FLOW execution after plans are compiled.

## 1. Machine Model
- Register-based VM (`r0`-`r7`).
- Program Counter, Call Stack, Heap managed by runtime.
- Instructions stored in bytecode blocks.

## 2. Instruction Families
- Data movement: `LOAD_CONST`, `MOV`, `PUSH`, `POP`.
- Arithmetic: `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `INC`, `DEC`.
- Comparisons / boolean: `CMPLT`, `CMPLE`, `CMPEQ`, `CMPNE`, `AND`, `OR`, `NOT`.
- Control flow: `JMP`, `JIF`, `CALL`, `RET`, `HALT`.
- Syscalls: `VOIKE_QUERY`, `VOIKE_BLOB`, `VOIKE_GRID_JOB`, `VOIKE_AI_ASK`, `VOIKE_RUN_JOB`, etc.

## 3. Calling Convention
- `r0` holds return values.
- `r1+` supply arguments.
- Complex args passed by pointer/heap references.

## 4. Example
```
; add(a,b)
L_add:
  ADD r0, r1, r2
  RET
```

## 5. FLOW Mapping
FLOW ops compile down into VASM or VVM/Grid invocations depending on scale, IRX hints, and cost models.
