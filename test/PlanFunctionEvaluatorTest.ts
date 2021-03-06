import { expect } from 'chai';

import fs from 'fs';
import os from 'os';
import { URI } from 'vscode-uri';
import { PlanFunctionEvaluator } from './src';
import { parser, DomainInfo, ProblemInfo, PlanInfo, Plan } from 'pddl-workspace';
import * as testUtils from './testUtils';
import { PlanTimeSeriesParser } from '../src/PlanTimeSeriesParser';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';
const PLAN_PATH = 'test/samples/temporal-numeric/problem.plan';

describe('PlanFunctionEvaluator', () => {
    if (os.platform() !== "win32") {
        // skip these tests on Linux and Mac, because ValueSeq runs into segmentation faults : (
        return;
    }

    let domain: DomainInfo;
    let problem: ProblemInfo;
    let plan: PlanInfo;
    let valStepPath: string;
    let valueSeqPath: string;

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
        plan = new parser.PddlPlanParser().parseText(planText, 0.001, URI.file(PLAN_PATH));
        console.log(JSON.stringify(plan.getSteps(), null, 2));

        valStepPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.valStepPath);
        valueSeqPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.valueSeqPath);
    });

    describe("#evaluate()", () => {
        it('evaluates single function', async () => {        
            // GIVEN
            const planObj = new Plan(plan.getSteps(), domain, problem);
            const planEvaluator = new PlanFunctionEvaluator(planObj, {
                valueSeqPath: valueSeqPath, valStepPath: valStepPath, shouldGroupByLifted: false
            });

            // WHEN
            const functionValues = await planEvaluator.evaluate();
            [...functionValues.values()].forEach(variableValues => {
                console.log(variableValues.toCsv());
            });

            // THEN
            expect(functionValues, "should have N variables").to.have.lengthOf(1);
            const variableFO1 = [...functionValues.keys()].find(v => v.getFullName() === "f o1");
            expect(variableFO1).is.not.undefined;
            if (variableFO1) {
                const variableFO1Values = functionValues.get(variableFO1);
                expect(variableFO1Values?.liftedVariable.getFullName()).to.equal("f o1");

                const eps = 1e-3;
                const td = PlanTimeSeriesParser.TIME_DELTA;
                const expectedChartValues = [[0, 0], [eps, 0], [eps + td, 10], [10 + eps, 20], [10 + eps + td, 30]];
                expect(variableFO1Values?.values).to.deep.equal(expectedChartValues);
                expect(variableFO1Values?.legend).to.deep.equal(["o1"]);
            }
        });
    });

    describe("#getFunction()", () => {
        it('finds function case sensitive', async () => {        
            // GIVEN
            const planObj = new Plan(plan.getSteps(), domain, problem);
            const planEvaluator = new PlanFunctionEvaluator(planObj, {
                valueSeqPath: valueSeqPath, valStepPath: valStepPath, shouldGroupByLifted: false
            });

            // WHEN
            const fO1 = planEvaluator.getFunction("f O1");
            const fo1 = planEvaluator.getFunction("f o1");

            // THEN
            expect(fO1).not.undefined;
            expect(fo1).not.undefined;
        });
    });

    describe("#evaluateMetrics()", () => {
        it('evaluates all metrics defined in the problem', async () => {        
            // GIVEN
            const planObj = new Plan(plan.getSteps(), domain, problem);
            const planEvaluator = new PlanFunctionEvaluator(planObj, {
                valueSeqPath: valueSeqPath, valStepPath: valStepPath, shouldGroupByLifted: false
            });

            // WHEN
            const functionValues = await planEvaluator.evaluateMetrics();
            [...functionValues.values()].forEach(variableValues => {
                console.log(variableValues.values);
            });

            // THEN
            expect(functionValues, "should have N variables").to.have.lengthOf(2);
            const metric0 = [...functionValues.keys()].find(v => v === "metric 0");
            expect(metric0).is.not.undefined;
            if (metric0) {
                const variableFO1Values = functionValues.get(metric0);
                expect(variableFO1Values?.variable.getFullName()).to.equal("metric 0");

                const eps = 1e-3;
                const td = PlanTimeSeriesParser.TIME_DELTA;
                const expectedChartValues = [[eps, 20], [10 + eps, 40], [10 + eps + td, 60]];
                expect(variableFO1Values?.values).to.deep.equal(expectedChartValues);
            }
        });
    });

    describe("#evaluateExpression(expression)", () => {
        it('evaluates expression', async () => {        
            // GIVEN
            const planObj = new Plan(plan.getSteps(), domain, problem);
            const planEvaluator = new PlanFunctionEvaluator(planObj, {
                valueSeqPath: valueSeqPath, valStepPath: valStepPath, shouldGroupByLifted: false
            });

            const metric = problem.getMetrics()[0];

            // WHEN
            const functionValues = await planEvaluator.evaluateExpression(metric.getExpression());

            // THEN
            const eps = 1e-3;
            const td = PlanTimeSeriesParser.TIME_DELTA;
            const expectedChartValues = [[0, 0], [eps, 0], [eps + td, 2*10], [10 + eps, 2*20], [10 + eps + td, 2*30]];
            expect(functionValues.values).to.deep.equal(expectedChartValues);
            expect(functionValues.getValue(0)).to.be.closeTo(0, 1e-5);
            expect(functionValues.getValue(2.5)).to.be.closeTo(25, 1e-2);
            expect(functionValues.getValue(5)).to.be.closeTo(30-0.002, 1e-5);
            expect(functionValues.getValue(7.5)).to.be.closeTo(35, 1e-2);
        });
    });
});