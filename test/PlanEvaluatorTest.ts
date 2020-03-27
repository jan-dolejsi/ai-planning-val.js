import { expect } from 'chai';

import fs from 'fs';
import { PlanEvaluator } from './src';
import { parser, DomainInfo, ProblemInfo, PlanInfo } from 'pddl-workspace';
import * as testUtils from './testUtils';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';
const PLAN_PATH = 'test/samples/temporal-numeric/problem.plan';

describe('PlanEvaluator', () => {
    let domain: DomainInfo;
    let problem: ProblemInfo;
    let plan: PlanInfo;
    let valStepPath: string;

    before(async () => {
        const domainText = fs.readFileSync(DOMAIN_PATH, { encoding: 'utf8', flag: 'r' });
        const parsedDomain = parser.PddlDomainParser.parseText(domainText);

        if (!parsedDomain) {
            throw new Error(`Invalid domain: ${DOMAIN_PATH}.`);
        }
        domain = parsedDomain;

        const problemText = fs.readFileSync(PROBLEM_PATH, { encoding: 'utf8', flag: 'r' });
        const parsedProblem = await parser.PddlProblemParser.parseText(problemText);

        if (!parsedProblem) {
            throw new Error(`Invalid problem: ${PROBLEM_PATH}.`);
        }
        problem = parsedProblem;

        const planText = fs.readFileSync(PLAN_PATH, { encoding: 'utf8', flag: 'r' });
        plan = parser.PddlPlanParser.parseText(planText, 0.001, PLAN_PATH);
        console.log(JSON.stringify(plan.getSteps(), null, 2));

        valStepPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.valStepPath);
    });

    describe("#evaluate()", () => {
        it('evaluates simple temporal numeric plan', async () => {
            // GIVEN
            const planEvaluator = new PlanEvaluator();

            // WHEN
            const finalState = await planEvaluator.evaluate(domain, problem, plan, { valStepPath: valStepPath });
            console.log(JSON.stringify(finalState, null, 2));

            // THEN
            expect(finalState, "should have N variables").to.have.lengthOf(3);
            {
                const qO1 = finalState.find(v => v.getVariableName() === 'q o1');
                expect(qO1?.getValue()).to.equal(true, "q o1 value");
            }
            {
                const pO1 = finalState.find(v => v.getVariableName() === 'p o1');
                expect(pO1?.getValue()).to.equal(true, "p o1 value");
            }
            {
                const fO1 = finalState.find(v => v.getVariableName() === 'f o1');
                expect(fO1?.getValue()).to.equal(30, "f o1 value");
            }
        });
    });
});