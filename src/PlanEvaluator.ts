/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Happening, Plan, PlanInfo } from 'pddl-workspace';
import { ProblemInfo, TimedVariableValue } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { ValStep, ValStepOptions } from './ValStep';

/**
 * Evaluates plan in the context of domain and problem and returns the final state.
 */
export class PlanEvaluator {

    async evaluateHappenings(domainInfo: DomainInfo, problemInfo: ProblemInfo, happenings: Happening[], options: ValStepOptions): Promise<TimedVariableValue[] | undefined> {
        return await new ValStep(domainInfo, problemInfo)
            .executeBatch(happenings, options);

        // todo: should correct the predicate/function/object names to the original capitalization
    }

    async evaluate(domainInfo: DomainInfo, problemInfo: ProblemInfo, planInfo: PlanInfo, options: ValStepOptions): Promise<TimedVariableValue[] | undefined> {
        // todo: run semantic validation for the plan first

        const happenings = planInfo.getHappenings();

        return this.evaluateHappenings(domainInfo, problemInfo, happenings, options);
    }

    async evaluatePlan(plan: Plan, options: ValStepOptions): Promise<TimedVariableValue[] | undefined> {
        // todo: run semantic validation for the plan first

        const happenings = PlanInfo.getHappenings(plan.steps);

        if (!plan.domain) {
            throw new Error('Domain not specified');
        }

        if (!plan.problem) {
            throw new Error('Problem not specified');
        }

        return this.evaluateHappenings(plan.domain, plan.problem, happenings, options);
    }
}