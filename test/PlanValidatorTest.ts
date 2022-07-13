/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from 'chai';
import { fail } from 'assert';

import fs from 'fs';
import path from 'path';
import { URI } from 'vscode-uri';
import { parser, DomainInfo, ProblemInfo, PlanInfo } from 'pddl-workspace';
import * as testUtils from './testUtils';
import { PlanValidator } from './src';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';
const PLAN_PATH = 'test/samples/temporal-numeric/problem.plan';

const domainUri = URI.file(path.join(process.cwd(), DOMAIN_PATH));
const problemUri = URI.file(path.join(process.cwd(), PROBLEM_PATH));
const planUri = URI.file(path.join(process.cwd(), PLAN_PATH));

describe('PlanValidator', () => {
    let domain: DomainInfo;
    let problem: ProblemInfo;
    let plan: PlanInfo;
    let validatorPath: string;

    before(async () => {
        const domainText = fs.readFileSync(domainUri.fsPath, { encoding: 'utf8', flag: 'r' });
        const parsedDomain = parser.PddlDomainParser.parseText(domainText, domainUri);

        if (!parsedDomain) {
            throw new Error(`Invalid domain: ${DOMAIN_PATH}.`);
        }
        domain = parsedDomain;

        const problemText = fs.readFileSync(problemUri.fsPath, { encoding: 'utf8', flag: 'r' });
        const parsedProblem = await parser.PddlProblemParser.parseText(problemText, problemUri);

        if (!parsedProblem) {
            throw new Error(`Invalid problem: ${PROBLEM_PATH}.`);
        }
        problem = parsedProblem;

        const planText = fs.readFileSync(planUri.fsPath, { encoding: 'utf8', flag: 'r' });
        const parsedPlan = new parser.PddlPlanParser().parseText(planText, 1e-3, planUri);

        if (!parsedPlan) {
            throw new Error(`Invalid plan: ${PLAN_PATH}.`);
        }
        plan = parsedPlan;

        validatorPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.validatePath);
    });

    function printToConsole(text: string): void {
        console.log(text);
    }

    describe("#validate", () => {
        it('validates a valid plan file', async () => {
            // GIVEN
            const validator = new PlanValidator(printToConsole);

            // WHEN
            const validationProblems = await validator.validate(domain, problem, plan, { cwd: '.', validatePath: validatorPath, epsilon: 1e-3 });

            // THEN
            expect(validationProblems.getError()).to.be.undefined;
            expect(validationProblems.getPlanProblems()).to.have.length(0);
        });

        it('invalid plan', async () => {
            // GIVEN
            const fawltyPlan = new parser.PddlPlanParser().parseText(plan.getText().replace('action1', "Fawlty Towers"), 1e-3, domain.fileUri);
            if (!fawltyPlan) {
                fail('Failed to create a syntactically fawlty :-] plan');
            }

            // WHEN
            const validator = new PlanValidator(printToConsole);
            const validationProblems = await validator.validate(domain, problem, fawltyPlan, { cwd: '.', validatePath: validatorPath, epsilon: 1e-3 });

            validationProblems.getPlanProblems().forEach((issue) => {
                console.log(`At ${issue.range.start.line}:${issue.range.start.character} ${issue.severity}: ${issue.problem}`);
            });

            // THEN
            expect(validationProblems.getError()).to.equal('Invalid plan description.');
            expect(validationProblems.getPlanProblems()).to.have.length(1);
            const problemZero = validationProblems.getPlanProblems()[0];
            expect(problemZero.problem).to.equal("Invalid plan description.");
            expect(problemZero.severity).to.equal("error");
            expect(problemZero.range.start.line).to.equal(0);
        });

        it('reports executable error', async () => {
            // GIVEN
            const validator = new PlanValidator(printToConsole);

            // WHEN
            try {
                await validator.validate(domain, problem, plan, { cwd: '.', validatePath: './blahblah', epsilon: 1e-3 });
            } catch (error) {
                // THEN
                expect((error as Error).message).to.contain('ENOENT');
            }
        });
    });
});
