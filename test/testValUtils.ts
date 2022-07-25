import { expect } from 'chai';
import fs = require('fs');
import os = require('os');

import { Util } from './src';

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

describe("Util", async () => {

    describe("#toFileSync()", () => {

        it("saves temp file", () => {
            // GIVEN
            // WHEN
            const fileName = Util.toFileSync(domainText, { suffix: '.pddl' });
            // THEN
            expect(fileName).to.not.be.undefined;
            const actualText = fs.readFileSync(fileName, { encoding: 'utf-8' });
            expect(actualText).to.equal(domainText);
        });

        it("saves temp file to an explicit temp folder on linux", () => {
            // GIVEN
            if (os.platform() !== 'linux') {
                return;
            }
            // WHEN
            const fileName = Util.toFileSync(domainText, { suffix: '.pddl', tmpdir: '/tmp' });
            // THEN
            expect(fileName).to.not.be.undefined;
            const actualText = fs.readFileSync(fileName, { encoding: 'utf-8' });
            expect(actualText).to.equal(domainText);
        });
    });

    describe("#toFile()", () => {

        it("saves temp file", done => {

            // GIVEN
            // WHEN
            Util.toFile(domainText, { suffix: '.pddl' })
                .then(fileName => {
                    expect(fileName).to.not.be.undefined;
                    const actualText = fs.readFileSync(fileName, { encoding: 'utf-8' });
                    expect(actualText).to.equal(domainText);
                    done();
                }).catch(error => done(error));
        });
    });

});