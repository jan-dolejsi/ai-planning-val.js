# VAL.js - AI Planning Plan Validation

[![CI](https://github.com/jan-dolejsi/ai-planning-val.js/workflows/Build/badge.svg)](https://github.com/jan-dolejsi/ai-planning-val.js/actions?query=workflow%3ABuild)
[![npm](https://img.shields.io/npm/v/ai-planning-val)](https://www.npmjs.com/package/ai-planning-val)

Javascript/typescript wrapper for VAL (plan validation tools from [KCL Planning department](https://github.com/KCL-Planning/VAL)).

- [VAL.js - AI Planning Plan Validation](#valjs---ai-planning-plan-validation)
  - [VAL Download](#val-download)
  - [ValStep state-by-state plan evaluation](#valstep-state-by-state-plan-evaluation)
    - [Batch plan evaluation](#batch-plan-evaluation)
    - [Batch evaluation with notification events fired for each intermediate state](#batch-evaluation-with-notification-events-fired-for-each-intermediate-state)
    - [Interactive plan execution](#interactive-plan-execution)
  - [`PlanEvaluator` class](#planevaluator-class)
  - [`ValueSeq` class](#valueseq-class)
  - [`PlanFunctionEvaluator` class](#planfunctionevaluator-class)
  - [`HappeningsToValStep` utility](#happeningstovalstep-utility)

## VAL Download

This package includes utility to download the VAL binaries. Select the build number, destination folder
and the binaries for linux/windows/macos will get downloaded automatically.
The 4 commonly used executables are `chmod +x`. If you use other utilities than `Parser`, `Validate`, `ValStep` or `ValueSeq`,
please adjust the chmod yourself.

If you install this package globally using `npm install ai-panning-val --global`, you can use this command from anywhere:

```bash
downloadVal --buildId=37 --destination=./val_binaries/
```

As a result, a folder named after the VAL version gets created in the `./val_binaries/` together with a `val.json` manifest:

```text
./val_binaries/Val-201909-11.1-win64/...
./val_binaries/val.json
```

The `val.json` is a machine readable manifest for easy consumption into any program. Here is an example:

```json
{
  "buildId": 37,
  "version": "20190911.1",
  "files": [
    "Val-20190911.1-win64/README.md",
    "Val-20190911.1-win64/bin/TIM.exe",
    "Val-20190911.1-win64/bin/Parser.exe",
    "..."
  ],
  "parserPath": "Val-20190911.1-win64/bin/Parser.exe",
  "validatePath": "Val-20190911.1-win64/bin/Validate.exe",
  "valueSeqPath": "Val-20190911.1-win64/bin/ValueSeq.exe",
  "valStepPath": "Val-20190911.1-win64/bin/ValStep.exe"
}
```

Alternatively, you can run this from your Javascript code:

```javascript
import { ValDownloader } from 'ai-planning-val';

const manifest = await new ValDownloader().download(37, './val_binaries/');
```

## [ValStep](https://github.com/KCL-Planning/VAL/blob/master/applications/README.md#valstep) state-by-state plan evaluation

The `ValStep.js` wrapper maybe used in multiple modes.

Following examples will be using this PDDL _domain_ and _problem_ as input:

Domain:

```lisp
(define (domain domain1)

(:requirements :strips )

(:predicates
    (p)
)

(:action a
    :parameters ()
    :precondition (and )
    :effect (and (p))
)
)
```

Problem:

```lisp
(define (problem problem1) (:domain domain1)

(:init )

(:goal (and
    (p)
))
)
```

### Batch plan evaluation

```typescript
import { parser, Happening, HappeningType } from 'pddl-workspace';
import { ValStep } from 'ai-planning-val';
```

```typescript
const domain = parser.PddlDomainParser.parseText(domainText);

const problem = await parser.PddlProblemParser.parseText(problemText);

const allHappenings = [
    new Happening(0.001, HappeningType.INSTANTANEOUS, 'a', 0)
];


const valStep = new ValStep(domain, problem);

valStep.executeBatch(allHappenings, {
    valStepPath: 'ValStep',
    verbose: true
}).then(valuesAtEnd => {
    console.log(`Values at end: ` +
        valuesAtEnd
            .map(v => `${v.getVariableName()}=${v.getValue()}`)
            .join(', '));
    // prints p=true
}).catch(error => done(error));
```

### Batch evaluation with notification events fired for each intermediate state

```typescript
const valStep = new ValStep(domain, problem);

valStep.onStateUpdated((happenings, newValues) => {
    console.log(`New Values (after applying ${happenings.length}): ` +
        newValues
            .map(v => `${v.getVariableName()}=${v.getValue()}`)
            .join(', '));
    // prints p=true
});

const valuesAtEnd = await valStep.executeIncrementally(allHappenings);
```

### Interactive plan execution

```typescript
const valStep = new ValStep(domain, problem);

valStep.onStateUpdated((happenings, newValues) => {
    console.log(`New Values (after applying ${happenings.length}): ` +
        newValues
            .map(v => `${v.getVariableName()}=${v.getValue()}`)
            .join(', '));
    // prints p=true
});

const valuesAtEnd = await valStep.executeIncrementally(allHappenings, {
    valStepPath: valManifest.valStepPath ?? 'ValStep'
});
```

## `PlanEvaluator` class

Evaluates the final state of the provided plan.

Let's consider this temporal and numeric PDDL [domain](test/samples/temporal-numeric/domain.pddl), [problem](test/samples/temporal-numeric/problem.pddl) and plan:

```lisp
;;!domain: domain1
;;!problem: problem1

0.00100: (action1 o1) [10.00000]

; Makespan: 10.001
; Cost: 10.001
; States evaluated: 2
```

```typescript
const plan = parser.PddlPlanParser.parseText(planText, 0.001, 'test/samples/temporal-numeric/problem.plan');

const planEvaluator = new PlanEvaluator(() => './val-binaries/..../ValStep);

const finalState = await planEvaluator.evaluate(domain, problem, plan);
console.log(JSON.stringify(finalState, null, 2));
```

The console should show this state vector (from the end of the plan):

```json
[
  {
    "time": 10.001,
    "variableName": "q o1",
    "value": true,
  },
  {
    "time": 10.001,
    "variableName": "p o1",
    "value": true,
  },
  {
    "time": 10.001,
    "variableName": "f o1",
    "value": 30,
  }
]
```

This utility is using ValStep in the batch mode, so the state values
all appear to have the same timestamp (timestamp of the last happening)
regardless what was the state at which those values were actually created.

> Only state values that were modified in the course of the plan,
> or were initialized in the original problem file are exported.

## `ValueSeq` class

Evaluates numeric function values as they change in the course of the plan.

```typescript
const valueSeq = new ValueSeq(domainPath, problemPath, planPath, {
    valueSeqPath: valueSeqPath,
    adjustDuplicateTimeStamp: true,
    verbose: true
});

const f = domain.getFunction('f'); // for more details, see ValueSeqTest.ts
if (!f) { fail(`'f' not found in domain`); }
const fO1 = f.bind([new ObjectInstance('o1', 'type1')]);

const values = await valueSeq.evaluate(f, [fO1]);

console.log(values.toCsv());
```

This prints the following comma-separated values:

|               | f ?t - t1 |
| ------------- | --------- |
| time          | o1        |
| 0             | 0         |
| 0.001         | 0         |
| 0.0010000001  | 10        |
| 10.001        | 20        |
| 10.0010000001 | 30        |

The `adjustDuplicateTimestamps` switch adds a `1e-10` delta to every duplicate timestamp,
so charting libraries can naturally plot the line as a step function.

> Known issue: Currently if multiple grounded functions are passed to `ValueSeq#evaluate(liftedFunction, groundedFunctions)` method,
> the `adjustDuplicatedTimeStamps=false` flag gets ignored in order to preserve
> duplicate timestamps.

## `PlanFunctionEvaluator` class

Evaluates numeric function values as they change in the course of the plan.

```typescript
const planObj = new Plan(plan.getSteps(), domain, problem);
const planEvaluator = new PlanFunctionEvaluator(planObj, {
    valueSeqPath: valueSeqPath, valStepPath: valStepPath, shouldGroupByLifted: true
});

const functionValues = await planEvaluator.evaluate();

// print out the data for each graph
[...functionValues.values()].forEach(variableValues => {
    console.log(variableValues.toCsv());
});
```

The above code sample prints csv table for each lifted function with one column
per grounded function. In other words, it outputs the same structure as `ValueSeq` above,
but for every lifted function.

> Known issue: the `options: { adjustDuplicatedTimeStamps=false }` flag gets ignored
> if the PDDL problem has multiple grounded functions in order to preserve the duplicate timestamps (for step function charts).

## `HappeningsToValStep` utility

Converts the `Happening` objects to input to the `ValStep` executable.
