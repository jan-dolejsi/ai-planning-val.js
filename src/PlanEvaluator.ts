/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { PlanInfo } from 'pddl-workspace';
import { ProblemInfo, TimedVariableValue } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { ValStep } from './ValStep';

/**
 * Evaluates plan in the context of domain and problem and returns time-series data set.
 */
export class PlanEvaluator {

    /**
     * Constructs
     * @param valStepPath callback to get valstep executable path
     */
    constructor(private valStepPath: () => string) {

    }

    async evaluate(domainInfo: DomainInfo, problemInfo: ProblemInfo, planInfo: PlanInfo): Promise<TimedVariableValue[]> {
        const happenings = planInfo.getHappenings();

        const path = this.valStepPath();

        if (path === undefined) { throw new Error('ValStep path not set.'); }

        return await new ValStep(domainInfo, problemInfo)
            .executeBatch(happenings, { valStepPath: path });
    }
}