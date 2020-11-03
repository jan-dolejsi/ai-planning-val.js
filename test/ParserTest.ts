/* eslint-disable @typescript-eslint/no-use-before-define */
import { expect } from 'chai';

import fs from 'fs';
import path from 'path';
import { parser, DomainInfo, ProblemInfo } from 'pddl-workspace';
import * as testUtils from './testUtils';
import * as process from 'child_process';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';

describe('Parser', () => {
    let domain: DomainInfo;
    let problem: ProblemInfo;
    let parserPath: string;

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

        parserPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.parserPath);
    });

    describe("#parse", () => {
        it('parses valid domain and problem file', async () => {
            const actual = await parse(parserPath, DOMAIN_PATH, PROBLEM_PATH);
            expect(actual?.success).to.equal(true);
        });

        it('can run from a path with a space', async () => {
            const origValPath = path.dirname(parserPath);
            const parserFileName = path.basename(parserPath);
            const valPathWithSpace = origValPath + ' with path';
            try {
                fs.renameSync(origValPath, valPathWithSpace);
                const parserPathWithSpace = path.join(valPathWithSpace, parserFileName);
                const actual = await parse(parserPathWithSpace, DOMAIN_PATH, PROBLEM_PATH);
                expect(actual?.success).to.equal(true);
            } finally {
                fs.renameSync(valPathWithSpace, origValPath);
            }
        });
    });
});

async function parse(parserPath: string, domain: string, problem: string): Promise<ParserOutput | undefined> {
    return new Promise<ParserOutput>(async (resolve, reject) => {
        const args = [domain, problem];
        console.log(`Parser path: ${parserPath}`);
        const child = process.spawn(parserPath, args);

        let parserOutput: ParserOutput | undefined;

        child.stdout.on('data', output => {
            const decodedOutput = output.toString("utf8");
            // console.log(decodedOutput)
            if (decodedOutput.match(/Errors: 0, warnings: 0/)) {
                parserOutput = { success: true }
            }
        });

        child.on("error", error => {
            if (!child.killed) {
                console.log(error.message);
                reject(error.message);
            }
        });

        child.on("close", (code, signal) => {
            if (code !== 0) {
                console.log(`Parser exit code: ${code}, signal: ${signal}.`);
                reject(`Parser exit code: ${code}, signal: ${signal}.`);
            } else {
                resolve(parserOutput);
            }
        });
    });
}

interface ParserOutput {
    success: boolean;
}