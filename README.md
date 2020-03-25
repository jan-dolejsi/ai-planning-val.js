# VAL.js - AI Planning Plan Validation

[![CI](https://github.com/jan-dolejsi/ai-planning-val.js/workflows/Build/badge.svg)](https://github.com/jan-dolejsi/ai-planning-val.js/actions?query=workflow%3ABuild)
[![npm](https://img.shields.io/npm/v/ai-planning-val)](https://www.npmjs.com/package/ai-planning-val)

Javascript/typescript wrapper for VAL (plan validation tools from [KCL Planning department](https://github.com/KCL-Planning/VAL)).

## VAL Download

This package includes utility to download the VAL binaries.

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
  "valStep": "Val-20190911.1-win64/bin/ValStep.exe"
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
    valStepPath: valManifest.valStep ?? 'ValStep'
});
```
