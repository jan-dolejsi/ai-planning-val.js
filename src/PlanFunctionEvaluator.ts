/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as process from 'child_process';

import { Variable, ProblemInfo, DomainInfo } from 'pddl-workspace';
import { Grounder } from 'pddl-workspace';
import { PlanInfo } from 'pddl-workspace';
import { Plan } from 'pddl-workspace';
import { utils } from 'pddl-workspace';
import { parser as parsers } from 'pddl-workspace';
import { ValStep } from './ValStep';


/**
 * Holds graph values for functions grounded from the same lifted function.
 */
class GroundedFunctionValues {
    values: (number | null)[][];
    constructor(public liftedVariable: Variable, values: number[][], public legend: string[]) {
        this.values = values.map(row => row.map(v => this.undefinedToNull(v)));
    }

    undefinedToNull(value: number): number | null {
        return value === undefined ? null : value;
    }

    adjustForStepFunctions(): GroundedFunctionValues {
        const adjustedValues: number[][] = [];
        let previousTime = -1;

        for (let index = 0; index < this.values.length; index++) {
            let time = this.values[index][0] ?? Number.NaN;

            if (time && previousTime > time) {
                time = previousTime + 1e-10;
            } else if (previousTime === time) {
                time += 1e-10;
            }

            adjustedValues.push([time].concat(this.values[index].slice(1).map(v => v === null ? Number.NaN : v)));

            previousTime = time;
        }

        return new GroundedFunctionValues(this.liftedVariable, adjustedValues, this.legend);
    }
}

export class PlanFunctionEvaluator {

    private grounder: Grounder;
    problem: ProblemInfo;
    domain: DomainInfo;

    constructor(private valueSeqPath: string | undefined, private valStepPath: string | undefined, private plan: Plan, private shouldGroupByLifted: boolean) {
        if (!this.plan.domain || !this.plan.problem) {
            throw new ReferenceError("Plan is missing domain or problem.");
        }
        this.domain = this.plan.domain;
        this.problem = this.plan.problem;
        this.grounder = new Grounder(this.plan.domain, this.plan.problem);
    }

    isAvailable(): boolean {
        return !!this.valueSeqPath && !!this.valStepPath;
    }

    getValStepPath(): string | undefined {
        return this.valStepPath;
    }

    async evaluate(): Promise<Map<Variable, GroundedFunctionValues>> {
        const domainFile = await utils.Util.toPddlFile("domain", this.domain.getText());
        const problemFile = await utils.Util.toPddlFile("problem", this.problem.getText());
        const planFile = await utils.Util.toPddlFile("plan", this.plan.getText());

        const chartData = new Map<Variable, GroundedFunctionValues>();

        const changingGroundedFunctions = await this.getChangingGroundedFunctions();

        const changingFunctionsGrouped = this.shouldGroupByLifted
            ? this.groupByLifted(changingGroundedFunctions)
            : this.doNotGroupByLifted(changingGroundedFunctions);

        const liftedFunctions = Array.from(changingFunctionsGrouped.keys());

        await Promise.all(liftedFunctions.map(async (liftedFunction) => {
            const groundedFunctions = changingFunctionsGrouped.get(liftedFunction);
            if (groundedFunctions) {
                await this.addChartValues(domainFile, problemFile, planFile, liftedFunction, groundedFunctions, chartData);
            }
        }));

        return chartData;
    }

    groupByLifted(variables: Variable[]): Map<Variable, Variable[]> {
        const grouped = new Map<Variable, Variable[]>();

        variables.forEach(var1 => {
            const lifted = this.domain.getLiftedFunction(var1);
            if (lifted) {
                const grounded = grouped.get(lifted);

                if (grounded) {
                    grounded.push(var1);
                } else {
                    grouped.set(lifted, [var1]);
                }
            }
        });

        return grouped;
    }

    doNotGroupByLifted(variables: Variable[]): Map<Variable, Variable[]> {
        const grouped = new Map<Variable, Variable[]>();

        variables.forEach(var1 => grouped.set(var1, [var1]));

        return grouped;
    }

    async getChangingGroundedFunctions(): Promise<Variable[]> {
        if (!this.valStepPath) { return []; }
        const happenings = PlanInfo.getHappenings(this.plan.steps);

        const finalStateValues = await new ValStep(this.domain, this.problem).executeBatch(this.valStepPath, "", happenings);

        if (finalStateValues === null) { return []; }

        return finalStateValues
            .map(value => this.getFunction(value.getVariableName()))
            .filter(variable => !!variable) // filter out null values
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .map(v => v!);
    }

    getFunction(variableName: string): Variable | null {
        const variableNameFragments = variableName.split(" ");
        const liftedVariableName = variableNameFragments[0];
        const liftedVariable = this.domain.getFunction(liftedVariableName);
        if (!liftedVariable) { return null; }
        const allConstantsAndObjects = this.domain.getConstants().merge(this.problem.getObjectsTypeMap());
        const objects = variableNameFragments.slice(1)
            .map(objectName => allConstantsAndObjects.getTypeOf(objectName)?.getObjectInstance(objectName))
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .filter(o => !!o).map(o => o!);
        return liftedVariable.bind(objects);
    }


    async tryAddChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, groundedFunctions: Variable[], chartData: Map<Variable, GroundedFunctionValues>): Promise<void> {
        try {
            await this.addChartValues(domainFile, problemFile, planFile, liftedFunction, groundedFunctions, chartData);
        } catch (err) {
            console.log("Cannot get values for function " + liftedFunction.getFullName());
            console.log(err);
        }
    }

    async addChartValues(domainFile: string, problemFile: string, planFile: string, liftedFunction: Variable, groundedFunctions: Variable[], chartData: Map<Variable, GroundedFunctionValues>): Promise<void> {
        if (groundedFunctions.length === 0) { return; }

        const functions = groundedFunctions
            .map(f => f.parameters.length > 0 ? `"${f.getFullName()}"` : f.getFullName())
            .map(name => name.toLowerCase())
            .join(' ')
            .toLowerCase();

        if (!this.valueSeqPath) { throw new Error('Check first Evaluator#isAvailable()'); }

        const valueSeqCommand = `${utils.Util.q(this.valueSeqPath)} -T ${domainFile} ${problemFile} ${planFile} ${functions}`;
        console.log(valueSeqCommand);
        const child = process.execSync(valueSeqCommand);

        const csv = child.toString();
        console.log(csv);

        const parser = new parsers.PlanTimeSeriesParser(groundedFunctions, csv);

        const functionsValuesValues = parser.getFunctionData(liftedFunction);
        if (functionsValuesValues.isConstant()) { return; } // it is not interesting...
        const functionValues = new GroundedFunctionValues(liftedFunction, functionsValuesValues.values, functionsValuesValues.legend);
        chartData.set(liftedFunction, functionValues.adjustForStepFunctions());
    }

    ground(variable: Variable): Variable[] {
        return this.grounder.ground(variable);
    }
}
