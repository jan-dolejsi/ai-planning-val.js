import { expect } from 'chai';

import { ValStep } from './src';
import { parser, Happening, HappeningType, DomainInfo, ProblemInfo } from 'pddl-workspace';
import * as testUtils from './testUtils';

const domainText = `(define (domain domain1)

(:requirements :strips )

(:predicates 
    (p)
)

(:action a
    :parameters ()
    :precondition (and )
    :effect (and (p))
)
)`;

const problemText = `(define (problem problem1) (:domain domain1)

(:init
    
)

(:goal (and
    (p)
))
)
`;

describe("ValStep", async () => {

    let domain: DomainInfo;
    let problem: ProblemInfo;
    let valStepPath: string | undefined;

    before(async () => {
        const parsedDomain = parser.PddlDomainParser.parseText(domainText);

        if (!parsedDomain) {
            throw new Error(`Invalid domain: ${domainText}.`);
        }
        domain = parsedDomain;

        const parsedProblem = await parser.PddlProblemParser.parseText(problemText);

        if (!parsedProblem) {
            throw new Error(`Invalid problem: ${problemText}.`);
        }

        problem = parsedProblem;

        valStepPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.valStepPath);
    });

    describe("#executeBatch()", () => {

        it("calculates state values", done => {

            // GIVEN
            const allHappenings = [
                new Happening(0.001, HappeningType.INSTANTANEOUS, 'a', 0)
            ];

            const valStep = new ValStep(domain, problem);

            // WHEN
            valStep.executeBatch(allHappenings, {
                valStepPath: valStepPath,
                verbose: true
            }).then(valuesAtEnd => {
                expect(valuesAtEnd).to.not.be.undefined;
                expect(valuesAtEnd).to.have.lengthOf(1);
                done();
            }).catch(error => done(error));
        });
    });

    describe("#executeIncrementally()", () => {

        it("notifies about state update", async () => {

            // GIVEN
            const allHappenings = [
                new Happening(0.001, HappeningType.INSTANTANEOUS, 'a', 0)
            ];

            return new Promise<void>(async (resolve) => {
                const valStep = new ValStep(domain, problem)
                    .onStateUpdated((happenings, newValues) => {
                        console.log(`New Values (after applying ${happenings.length}): ` +
                            newValues
                                .map(v => `${v.getVariableName()}=${v.getValue()}`)
                                .join(', '));

                        expect(happenings).to.have.lengthOf(1);
                        expect(newValues).to.have.lengthOf(1);
                        expect(newValues[0].getVariableName()).to.equal('p');
                        expect(newValues[0].getValue()).to.equal(true);
                        resolve();
                    });

                // WHEN
                const valuesAtEnd = await valStep.executeIncrementally(allHappenings, {
                    valStepPath: valStepPath
                });

                expect(valuesAtEnd).to.have.lengthOf(1);
            });
        });
    });

    describe("#postHappenings()", () => {

        it.skip("notifies about state update", async () => {

            // GIVEN
            const happeningsAtTime0 = [
                new Happening(0.001, HappeningType.INSTANTANEOUS, 'a', 0)
            ];

            return new Promise<void>(async (resolve, reject) => {
                const valStep = new ValStep(domain, problem)
                    .onceStateUpdated((happenings, newValues) => {
                        console.log(`New Values (after applying ${happenings.length}): ` +
                            newValues
                                .map(v => `${v.getVariableName()}=${v.getValue()}`)
                                .join(', '));

                        expect(happenings).to.have.lengthOf(1);
                        expect(newValues).to.have.lengthOf(1);
                        expect(newValues[0].getVariableName()).to.equal('p');
                        expect(newValues[0].getValue()).to.equal(true);
                        resolve();
                    });

                try {
                    // WHEN
                    const posted = await valStep.postHappenings(happeningsAtTime0, {
                        valStepPath: valStepPath,
                        timeout: 1,
                        verbose: false
                    });

                    expect(posted).to.equal(true);
                } catch (err) {
                    reject(err);
                }

            });
        }).timeout(1000);
    });
});