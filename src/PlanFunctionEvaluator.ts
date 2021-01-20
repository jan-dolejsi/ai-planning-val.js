/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */

import { Variable, ProblemInfo, DomainInfo, PlanInfo, Grounder, Plan, NumericExpression, EvaluationContext } from 'pddl-workspace';
import { ValStep } from './ValStep';
import { GroundedFunctionValues, ValueSeq, ValueSeqOptions } from './ValueSeq';
import { FunctionValues } from './PlanTimeSeriesParser';
import { Util } from './valUtils';

/* eslint-disable @typescript-eslint/no-use-before-define */

export interface PlanFunctionEvaluatorOptions extends ValueSeqOptions {
    /** If set to true, functions are grouped by lifted function name */
    shouldGroupByLifted?: boolean;

    /** ValStep path */
    valStepPath?: string;
}

/** Evaluates numeric function values in the course of the plan. */
export class PlanFunctionEvaluator {

    private readonly grounder: Grounder;
    private readonly problem: ProblemInfo;
    private readonly domain: DomainInfo;

    /**
     * Constructs
     * @param plan plan to evaluate
     * @param options options
     */
    constructor(private plan: Plan, private options?: PlanFunctionEvaluatorOptions) {

        if (!this.plan.domain || !this.plan.problem) {
            throw new ReferenceError("Plan is missing domain or problem.");
        }
        this.domain = this.plan.domain;
        this.problem = this.plan.problem;
        this.grounder = new Grounder(this.plan.domain, this.plan.problem);
    }

    /**
     * @returns `true` if the underlying utilities are available.
     */
    isAvailable(): boolean {
        return !!this.options?.valueSeqPath && !!this.options.valStepPath;
    }

    getValStepPath(): string | undefined {
        return this.options?.valStepPath;
    }

    /**
     * Evaluates the functions individually, or in groups by lifted function.
     */
    async evaluate(): Promise<Map<Variable, GroundedFunctionValues>> {
        const domainFile = await Util.toPddlFile("domain", this.domain.getText());
        const problemFile = await Util.toPddlFile("problem", this.problem.getText());
        const planFile = await Util.toPddlFile("plan", this.plan.getText());

        const chartData = new Map<Variable, GroundedFunctionValues>();

        const changingGroundedFunctions = await this.getChangingGroundedFunctions();

        const changingFunctionsGrouped = this.options?.shouldGroupByLifted ?? true
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

    async evaluateMetrics(): Promise<Map<string, FunctionValues>> {
        const domainFile = await Util.toPddlFile("domain", this.domain.getText());
        const problemFile = await Util.toPddlFile("problem", this.problem.getText());
        const planFile = await Util.toPddlFile("plan", this.plan.getText());

        return await new ValueSeq(domainFile, problemFile, planFile, this.options).evaluateMetric();
    }

    async evaluateExpressionInputs(expression: NumericExpression): Promise<Map<string, FunctionValues>> {
        const inputVariables = expression.getVariables();

        const domainFile = await Util.toPddlFile("domain", this.domain.getText());
        const problemFile = await Util.toPddlFile("problem", this.problem.getText());
        const planFile = await Util.toPddlFile("plan", this.plan.getText());

        return await new ValueSeq(domainFile, problemFile, planFile, this.options).evaluate(inputVariables);
    }

    async evaluateExpression(expression: NumericExpression): Promise<FunctionValues> {
        const inputValues = await this.evaluateExpressionInputs(expression);

        const fv = new FunctionValues(new Variable("~expression"));

        if (inputValues.size === 0) {
            const context = new StaticEvaluationContext();
            const constantValue = expression.evaluate(context);
            const constantDefinedValue = constantValue === undefined ? NaN : constantValue;
            fv.addValue(0, constantDefinedValue);
            fv.addValue(this.plan.makespan, constantDefinedValue);
        } else {
            const context = new ValueSeqEvaluationContext(inputValues);

            const firstInput = [...inputValues.values()][0];

            for (let index = 0; index < firstInput.values.length; index++) {
                const time = firstInput.getTimeAtIndex(index);
                context.setTime(time);
                const valueAtTime = expression.evaluate(context);
                fv.addValue(time, valueAtTime !== undefined ? valueAtTime : NaN);
            }
        }

        return fv;
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
        if (!this.options?.valStepPath) { return []; }
        const happenings = PlanInfo.getHappenings(this.plan.steps);

        const finalStateValues = await new ValStep(this.domain, this.problem)
            .executeBatch(happenings, this.options);

        if (!finalStateValues) { return []; } // ValStep failed

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

    async addChartValues(domainFile: string, problemFile: string, planFile: string,
        liftedFunction: Variable, groundedFunctions: Variable[],
        chartData: Map<Variable, GroundedFunctionValues>): Promise<void> {

        if (!this.options?.valueSeqPath) { throw new Error('Check first Evaluator#isAvailable()'); }
        if (groundedFunctions.length === 0) { return; }

        const valueSeq = new ValueSeq(domainFile, problemFile, planFile, this.options);
        let values = await valueSeq.evaluateForLifted(liftedFunction, groundedFunctions);

        if (!values) { // it was either empty (no grounding) or constant
            return;
        }

        if (this.options?.adjustDuplicatedTimeStamps) {
            values = values.adjustForStepFunctions();
        }

        chartData.set(liftedFunction, values);
    }

    ground(variable: Variable): Variable[] {
        return this.grounder.ground(variable);
    }
}

class StaticEvaluationContext implements EvaluationContext {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    get(variableName: string): number | boolean | undefined {
        throw new Error("Method not implemented.");
    }
}


class ValueSeqEvaluationContext implements EvaluationContext {
    time = 0;

    constructor(private readonly values: Map<string, FunctionValues>) { }

    setTime(time: number): void {
        this.time = time;
    }

    get(variableName: string): number | boolean | undefined {
        const values = this.values.get(variableName);
        return values?.getValue(this.time);
    }

}
