/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as process from 'child_process';
import * as os from 'os';

import { Variable } from 'pddl-workspace';
import { PlanTimeSeriesParser, FunctionValues } from './PlanTimeSeriesParser';

export interface ValueSeqOptions {
    verbose?: boolean;

    /** ValueSeq path */
    valueSeqPath?: string;

    /** Adjusts duplicated time stamps. */
    adjustDuplicatedTimeStamps?: boolean;
}

/**
 * Holds graph values for functions grounded from the same lifted function.
 */
export class GroundedFunctionValues {
    values: (number | null)[][];
    public static readonly TIME_DELTA = 1e-10;

    constructor(public readonly liftedVariable: Variable, values: number[][], public readonly legend: string[]) {
        this.values = values.map(row => row.map(v => GroundedFunctionValues.undefinedToNull(v)));
    }

    public static undefinedToNull(value: number): number | null {
        return value === undefined ? null : value;
    }

    adjustForStepFunctions(): GroundedFunctionValues {
        const adjustedValues: number[][] = [];
        let previousTime = -1;

        for (let index = 0; index < this.values.length; index++) {
            let time = this.values[index][0] ?? Number.NaN;

            if (time && previousTime > time) {
                time = previousTime + GroundedFunctionValues.TIME_DELTA;
            } else if (previousTime === time) {
                time += GroundedFunctionValues.TIME_DELTA;
            }

            adjustedValues.push([time].concat(this.values[index].slice(1).map(v => v === null ? Number.NaN : v)));

            previousTime = time;
        }

        return new GroundedFunctionValues(this.liftedVariable, adjustedValues, this.legend);
    }

    toCsv(): string {
        const header1 = ['', this.liftedVariable.getFullName()];
        const header2 = ['time', ...this.legend];

        return [header1, header2, ...this.values]
            .map(row => row.join(', '))
            .join(os.EOL);
    }
}

/** Wrapper for the ValueSeq executable. */
export class ValueSeq {

    constructor(private domainFile: string, private problemFile: string,
        private planFile: string, private options?: ValueSeqOptions) { }

    async evaluateForLifted(liftedFunction: Variable, groundedFunctions: Variable[]): Promise<GroundedFunctionValues | undefined> {
        const csv = await this.callValueSeq(groundedFunctions);

        if (csv === undefined) { return undefined; }

        const parser = new PlanTimeSeriesParser(groundedFunctions, csv, this.options?.adjustDuplicatedTimeStamps);

        const functionsValuesValues = parser.getFunctionData(liftedFunction);
        if (functionsValuesValues.isConstant()) { return undefined; } // it is not interesting...

        return new GroundedFunctionValues(liftedFunction, functionsValuesValues.values, functionsValuesValues.legend);
    }

    async evaluate(groundedFunctions: Variable[]): Promise<Map<string, FunctionValues>> {
        const csv = await this.callValueSeq(groundedFunctions);

        if (csv === undefined) { return new Map(); }

        const parser = new PlanTimeSeriesParser(groundedFunctions, csv, this.options?.adjustDuplicatedTimeStamps);

        const functionValues = groundedFunctions.map(functionName => parser.getFunctionValues(functionName))

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return new Map(functionValues.filter(fv => !!fv).map(fv => [fv!.variable.getFullName(), fv!]));
    }

    async callValueSeq(groundedFunctions: Variable[]): Promise<string | undefined> {
        if (groundedFunctions.length === 0) { return undefined; }

        const functions = groundedFunctions
            .map(f => f.getFullName())
            .map(name => name.toLowerCase());

        const valueSeqCommand = this.options?.valueSeqPath ?? 'ValueSeq';

        const valueSeqArgs = ["-T", this.domainFile, this.problemFile, this.planFile].concat(functions);

        if (this.options?.verbose) {
            console.log(valueSeqCommand + ' ' + valueSeqArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' '));
        }

        const csv = await new Promise<string>((resolve, reject) => {
            process.execFile(valueSeqCommand, valueSeqArgs, { encoding: 'utf8' },
                (error, stdout, stderr) => {

                    if (error) {
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        console.warn(stderr);
                    }
                    resolve(stdout);
                });
        });

        if (this.options?.verbose) {
            console.log(csv);
        }

        return csv;
    }
}
