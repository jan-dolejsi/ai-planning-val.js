import { expect } from 'chai';

import fs from 'fs';
import os from 'os';
import { ValueSeq } from './src';
import { parser, DomainInfo, ObjectInstance } from 'pddl-workspace';
import * as testUtils from './testUtils';
import { PlanTimeSeriesParser } from '../src/PlanTimeSeriesParser';
import { fail } from 'assert';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';
const PLAN_PATH = 'test/samples/temporal-numeric/problem.plan';

describe('ValueSeq', () => {
    let domain: DomainInfo;
    let valueSeqPath: string;

    if (os.platform() !== "win32") {
        // skip these tests on Linux and Mac, because ValueSeq runs into segmentation faults : (
        return;
    }

    before(async () => {
        const domainText = fs.readFileSync(DOMAIN_PATH, { encoding: 'utf8', flag: 'r' });
        const parsedDomain = parser.PddlDomainParser.parseText(domainText);

        if (!parsedDomain) {
            throw new Error(`Invalid domain: ${DOMAIN_PATH}.`);
        }
        domain = parsedDomain;

        valueSeqPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.valueSeqPath);
    });

    describe("#evaluateForLifted()", () => {
        it('evaluates single function (adjustDuplicateTimeStamp: true)', async () => {
            // GIVEN
            const valueSeq = new ValueSeq(DOMAIN_PATH, PROBLEM_PATH, PLAN_PATH, {
                valueSeqPath: valueSeqPath,
                adjustDuplicatedTimeStamps: true,
                verbose: true
            });

            const f = domain.getFunction('f');
            if (!f) { fail(`'f' not found in domain`); }
            const fO1 = f.ground([new ObjectInstance('o1', 'type1')]);

            // WHEN
            const values = await valueSeq.evaluateForLifted(f, [fO1]);

            // THEN
            expect(values).to.not.be.undefined;
            if (!values) { return; }
            expect(values.legend, "legend").to.have.lengthOf(1);
            expect(values.legend, "legend").to.be.deep.equal(['o1']);
            expect(values.liftedVariable.getFullName(), "lifted var full name").to.be.equal('f ?t - t1');
            const eps = 1e-3;
            const td = PlanTimeSeriesParser.TIME_DELTA;
            const expectedChartValues = [[0, 0], [eps, 0], [eps + td, 10], [10 + eps, 20], [10 + eps + td, 30]];
            expect(values.values).to.deep.equal(expectedChartValues);
        });

        it('evaluates single function (adjustDuplicateTimeStamp: false)', async () => {
            // GIVEN
            const valueSeq = new ValueSeq(DOMAIN_PATH, PROBLEM_PATH, PLAN_PATH, {
                valueSeqPath: valueSeqPath,
                adjustDuplicatedTimeStamps: false, // <- here is the difference from previous test
                verbose: true
            });

            const f = domain.getFunction('f');
            if (!f) { fail(`'f' not found in domain`); }
            const fO1 = f.ground([new ObjectInstance('o1', 'type1')]);

            // WHEN
            const values = await valueSeq.evaluateForLifted(f, [fO1]);

            // THEN
            expect(values).to.not.be.undefined;
            if (!values) { return; }
            expect(values.legend, "legend").to.have.lengthOf(1);
            expect(values.legend, "legend").to.be.deep.equal(['o1']);
            expect(values.liftedVariable.getFullName(), "lifted var full name").to.be.equal('f ?t - t1');
            const eps = 1e-3;
            const expectedChartValues = [[0, 0], [eps, 0], [eps, 10], [10 + eps, 20], [10 + eps, 30]];
            expect(values.values).to.deep.equal(expectedChartValues);
        });

        it.skip('evaluates two grounded functions, keeping non-distinct timestamps', () => {
            fail('that would not work yet');
        })
    });
    
    describe("#evaluate()", () => {
        it('evaluates single function (adjustDuplicateTimeStamp: true)', async () => {
            // GIVEN
            const valueSeq = new ValueSeq(DOMAIN_PATH, PROBLEM_PATH, PLAN_PATH, {
                valueSeqPath: valueSeqPath,
                adjustDuplicatedTimeStamps: true,
                verbose: true
            });

            const f = domain.getFunction('f');
            if (!f) { fail(`'f' not found in domain`); }
            const fO1 = f.ground([new ObjectInstance('o1', 'type1')]);

            // WHEN
            const values = await valueSeq.evaluate([fO1]);

            // THEN
            expect(values).to.not.be.undefined;
            if (!values) { return; }
            const fO1Values = values.get(fO1.getFullName());
            expect(fO1Values).to.not.be.undefined;
            // todo: expect(fO1Values?.getLegend(), "legend").to.equal(fO1.getFullName());
            expect(fO1Values?.variable, "variable").to.be.deep.equal(fO1);
            expect(fO1Values?.getTimeAtIndex(0)).to.equal(0);
            expect(fO1Values?.getValueAtIndex(0)).to.equal(0);
            const eps = 1e-3;
            const td = PlanTimeSeriesParser.TIME_DELTA;
            const expectedChartValues = [[0, 0], [eps, 0], [eps + td, 10], [10 + eps, 20], [10 + eps + td, 30]];
            expect(fO1Values?.values).to.deep.equal(expectedChartValues);
        });
    });
});