/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Variable } from 'pddl-workspace';

export class FunctionValues {
    values: number[][] = [];
    private legend: string;

    constructor(public variable: Variable) {
        this.legend = variable.parameters.map(p => p.toPddlString()).join(' ');
    }

    addValue(time: number, value: number): void {
        this.values.push([time, value]);
    }

    lastTime(): number {
        return this.values.length > 0 ? this.values[this.values.length - 1][0] : NaN;
    }

    getLegend(): string {
        return this.legend;
    }
}

export class StateValues {
    private values = new Map<Variable, number>();

    constructor(public time: number) {

    }

    setValue(variable: Variable, value: number): StateValues {
        this.values.set(variable, value);
        return this;
    }

    getValue(variable: Variable): number {
        return this.values.get(variable) ?? Number.NaN;
    }

    toNumbers(variables: Variable[]): number[] {
        let output = variables.map(f => this.getValue(f));

        output = [this.time].concat(output);

        return output;
    }
}

/**
 * Structure that holds values for multiple functions
 */
export class FunctionsValues {
    legend: string[];

    constructor(public readonly liftedVariable: Variable, public readonly values: number[][], public readonly functions: Variable[]) {
        if (functions.length === 1 && functions[0].parameters.length === 0) {
            // the function had no parameters
            this.legend = [liftedVariable.name];
        }
        else {
            const objects = this.functions.map(f => f.parameters.map(p => p.toPddlString()).join(' '));
            this.legend = objects;
        }
    }

    isConstant(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        return this.functions.every((_, idx) => {
            const firstValue = that.values[0][idx + 1];
            return that.values.every(values1 => values1[idx + 1] === firstValue);
        });
    }
}

export class PlanTimeSeriesParser {

    private readonly functionValues = new Map<Variable, FunctionValues>();
    private readonly warnings: string[];

    public static readonly TIME_DELTA = 1e-10;

    constructor(public readonly functions: Variable[], timeSeriesCsv: string, adjustDuplicatedTimeStamps = true) {

        const lines = timeSeriesCsv.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        this.warnings = lines.filter(line => line.includes(':'));

        let currentFunctionValues: FunctionValues | null = null;

        lines
            .filter(line => !line.includes(':'))
            .forEach(line => {
                const newFunction = functions.find(f =>
                    line.match(new RegExp("^\s*(;)?\s*" + f.getFullName() + "\s*$", "i")));

                if (newFunction) {
                    if (currentFunctionValues) { this.addFunctionValues(currentFunctionValues); }
                    currentFunctionValues = new FunctionValues(newFunction);
                }
                else {
                    // eslint-disable-next-line prefer-const
                    let [time, value] = line.split(',').map(v => parseFloat(v.trim()));
                    if (currentFunctionValues === null) {
                        throw new Error(`The ValueSeq output does not include function names ${functions.map(f => f.getFullName())}`);
                    }
                    if (isNaN(time) || value === undefined) {
                        throw new Error(`The ValueSeq output does not parse: ${line}`);
                    }
                    else {
                        if (adjustDuplicatedTimeStamps) {
                            if (currentFunctionValues.lastTime() > time) {
                                time = currentFunctionValues.lastTime() + PlanTimeSeriesParser.TIME_DELTA;
                            } else if (currentFunctionValues.lastTime() === time) {
                                time += PlanTimeSeriesParser.TIME_DELTA;
                            }
                        }
                        currentFunctionValues.addValue(time, value);
                    }
                }
            });

        this.warnings.forEach(w => console.warn('ValueSeq: ' + w));

        if (currentFunctionValues) {
            this.addFunctionValues(currentFunctionValues);
        }
    }

    private addFunctionValues(newFunctionValues: FunctionValues): void {
        this.functionValues.set(newFunctionValues.variable, newFunctionValues);
    }

    getFunctionValues(variable: Variable): FunctionValues | undefined {
        return this.functionValues.get(variable);
    }

    getGroundedFunctionsValues(liftedVariable: Variable): FunctionValues[] {
        const groundedFunctions = [...this.functionValues.keys()]
            .filter(var1 => var1.name === liftedVariable.name);

        return groundedFunctions
            .map(f => this.functionValues.get(f))
            .filter(f => !!f)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .map(f => f!);
    }

    getFunctionData(liftedVariable: Variable): FunctionsValues {
        const functionValues = this.getGroundedFunctionsValues(liftedVariable);

        const groundedFunctions = functionValues.map(fv => fv.variable);

        if (groundedFunctions.length === 0) return new FunctionsValues(liftedVariable, [], groundedFunctions);

        const states: StateValues[] = groundedFunctions.length > 1 ?
            // todo: this is where the duplicate timestamps (step functions) get removed; 
            // need a smarter algorithm for combining multiple function values, while retaining step functions
            functionValues.reduce((previousValues, currentValues) =>
                PlanTimeSeriesParser.join(previousValues, currentValues), new Array<StateValues>()) :
            // in case of single grounded function, let's avoid removing the duplicate timestamps
            functionValues[0].values.map(v => new StateValues(v[0]).setValue(functionValues[0].variable, v[1]));

        const data = states.map(state => state.toNumbers(groundedFunctions));

        return new FunctionsValues(liftedVariable, data, groundedFunctions);
    }

    static join(previousValues: StateValues[], currentValues: FunctionValues): StateValues[] {
        currentValues.values.forEach(timeAndValue => {
            const currentTime = timeAndValue[0];
            let stateFound = previousValues.find(state => state.time === currentTime);
            if (!stateFound) {
                stateFound = new StateValues(currentTime);
                previousValues.push(stateFound);
                previousValues.sort((s1, s2) => s1.time - s2.time);
            }

            stateFound.setValue(currentValues.variable, timeAndValue[1]);
        });

        return previousValues;
    }
}
