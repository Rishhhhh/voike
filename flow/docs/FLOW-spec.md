# FLOW Specification (v1)

FLOW is a **step-based semantic plan format**. This spec defines:

- Syntax
- Core operations (opcodes)
- Type system
- Versioning and compatibility rules

## 1. Syntax

### 1.1 File structure

A FLOW file has:

1. Header
2. Optional INPUTS block
3. STEP definitions
4. Footer

Example:

```
FLOW "Predict churn with Keras model"

INPUTS
  table customers
END INPUTS

STEP data =
  LOAD TABLE "customers"

STEP clean =
  MAP data USING normalize_customer_features

STEP model =
  LOAD MODEL "churn_keras" VERSION "2.1.0"

STEP preds =
  INFER model ON clean

STEP scored =
  MAP preds USING attach_customer_ids

STEP store =
  STORE scored AS TABLE "customer_churn_scores"

STEP summary =
  ASK_AI "Summarize churn risk by region" WITH context scored INTO summary

STEP output =
  OUTPUT summary AS "Churn summary"

END FLOW
```

### 1.2 Grammar (EBNF-style)

```
FlowFile      = "FLOW" StringLiteral Newline
                [ InputsBlock ]
                { StepDef }
                "END" "FLOW" ;

InputsBlock   = "INPUTS" Newline
                { InputDecl Newline }
                "END" "INPUTS" Newline ;

InputDecl     = TypeIdentifier Identifier [ "(optional)" ] ;

StepDef       = "STEP" Identifier "=" Newline
                Indent OperationBlock Dedent ;

OperationBlock = OperationLine { Newline OperationLine } ;

OperationLine = DataOp
              | MLOp
              | JobOp
              | AIOp
              | IOOp
              | ControlOp ;

TypeIdentifier = "file" | "number" | "table" | "text" | "image" | "blob" | "json" ;

Identifier    = /[A-Za-z_][A-Za-z0-9_]*/ ;

StringLiteral = "\"" { any char except quote } "\"" ;
NumberLiteral = /[0-9]+(\.[0-9]+)?/ ;

Condition     = Expression (("AND" | "OR") Expression)* ;
Expression    = ...
```

Indentation-based blocks can be implemented with explicit INDENT/DEDENT tokens.

## 2. Core Operations (v1)

Each operation is a **versioned contract**: `NAME@MAJOR.MINOR`.

### 2.1 Data & Lists

#### LOAD CSV / JSON / TABLE
Contracts `LOAD_CSV@1.0`, `LOAD_JSON@1.0`, `LOAD_TABLE@1.0` map files/tables into tables/json values with optional options (delimiter, header, table name).

#### FILTER / MAP / GROUP_AGG / JOIN / SORT / TAKE
Provide high-level semantics for filtering rows, mapping via functions, grouping/aggregating, joining datasets, sorting, and slicing results.

### 2.2 ML / Inference

- `LOAD_MODEL@1.0`
- `INFER@1.0`
- `TRAIN@1.0`

These bridge to VVM descriptors for loading and executing models.

### 2.3 External Code & Jobs

- `RUN_JOB@1.0` to invoke registered VVM jobs.
- `CALL@1.0` for local/library functions.

### 2.4 AI Fabric / LLM

- `ASK_AI@1.0` executes Knowledge Fabric prompts with context.

### 2.5 IO

- `OUTPUT`, `STORE TABLE`, `STORE MODEL`.

### 2.6 Control Ops

- `LOOP`, `BRANCH` (rare fallback when declarative ops insufficient).

## 3. Types

Core types: `number`, `text`, `bool`, `table`, `json`, `blob`, `image`, `tensor`, `modelRef`. Type checking occurs at compile time when possible and at runtime otherwise.

## 4. Versioning

Ops carry explicit version numbers. Breaking semantic changes require bumping MAJOR while keeping older versions available until flows migrate. Minor bumps are backwards-compatible extensions.
