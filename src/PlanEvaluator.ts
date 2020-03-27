/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PlanInfo } from 'pddl-workspace';
import { ProblemInfo, TimedVariableValue } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { ValStep, ValStepOptions } from './ValStep';

/**
 * Evaluates plan in the context of domain and problem and returns the final state.
 */
export class PlanEvaluator {

    async evaluate(domainInfo: DomainInfo, problemInfo: ProblemInfo, planInfo: PlanInfo, options: ValStepOptions): Promise<TimedVariableValue[]> {
        // todo: run semantic validation for the plan first

        const happenings = planInfo.getHappenings();

        return await new ValStep(domainInfo, problemInfo)
            .executeBatch(happenings, options);
    }
}