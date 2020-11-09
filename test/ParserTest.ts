/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from 'chai';
import { fail } from 'assert';

import fs from 'fs';
import path from 'path';
import { URI } from 'vscode-uri';
import { parser, DomainInfo, ProblemInfo } from 'pddl-workspace';
import * as testUtils from './testUtils';
import { Parser, ParserRunContext, ProblemPattern } from './src';

const DOMAIN_PATH = 'test/samples/temporal-numeric/domain.pddl';
const PROBLEM_PATH = 'test/samples/temporal-numeric/problem.pddl';

const domainUri = URI.file(path.join(process.cwd(), DOMAIN_PATH));
const problemUri = URI.file(path.join(process.cwd(), PROBLEM_PATH));

describe('Parser', () => {
    let domain: DomainInfo;
    let problem: ProblemInfo;
    let parserPath: string;

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

        parserPath = testUtils.getValToolPath(await testUtils.getDownloadedManifest(), manifest => manifest.parserPath);
    });

    describe("#parse", () => {
        it('parses valid domain and problem file', async () => {
            // GIVEN
            const parser = new Parser({ executablePath: parserPath });

            // WHEN
            const parsingProblems = await parser.validate(domain, problem);

            // THEN
            expect(parsingProblems).to.have.length(0);
        });

        it('parses invalid domain file', async () => {
            // GIVEN
            const fawltyDomain = parser.PddlDomainParser.parseText(domain.getText().replace(':predicates', "Fawlty Towers"), domain.fileUri);
            if (!fawltyDomain) {
                fail('Failed to create a syntactically fawlty :-] domain');
            }
            const pddlParser = new Parser({ executablePath: parserPath });

            // WHEN
            const parsingProblems = await pddlParser.validate(fawltyDomain);

            parsingProblems.forEach((issues, fileUri) => {
                console.log(`Parsing problems in ${fileUri}`);
                issues.forEach(issue => console.log(`At line: ${issue.range.start.line} ${issue.severity}: ${issue.problem}`))
            });

            // THEN
            expect(parsingProblems).to.have.length(1);
            const domainParsingProblems = parsingProblems.get(fawltyDomain.fileUri);
            const domainParsingErrors = domainParsingProblems?.filter(prob => prob.severity === "error");
            expect(domainParsingErrors).to.have.lengthOf(1);
            const error = domainParsingErrors?.[0];
            expect(error?.range.start.line).to.equal(10);
        });

        it('can run from a path with a space', async () => {
            const origValPath = path.dirname(parserPath);
            const parserFileName = path.basename(parserPath);
            const valPathWithSpace = origValPath + ' with path';
            try {
                fs.renameSync(origValPath, valPathWithSpace);
                const parserPathWithSpace = path.join(valPathWithSpace, parserFileName);

                // GIVEN
                const parser = new Parser({ executablePath: parserPathWithSpace });

                // WHEN
                const parsingProblems = await parser.validate(domain, problem);

                // THEN
                expect(parsingProblems).to.have.length(0);

            } finally {
                fs.renameSync(valPathWithSpace, origValPath);
            }
        });
    });

    describe('#processOutput', () => {
        it('it parses output', async () => {
            // GIVEN
            const parser = new MockParser();

            // WHEN
            const parsingProblems = await parser.validate(domain, problem);

            // THEN
            expect(parsingProblems).to.have.length(2, "2 files with issues in total");

            const domainProblems = parsingProblems.get(domain.fileUri);
            expect(domainProblems).to.have.length(2, "2 issues in domain");

            const problemProblems = parsingProblems.get(problem.fileUri);
            expect(problemProblems).to.have.length(2, "2 issues in problem");
        });
    })
});

// Can implement a custom parser - using the pddl4j as an example

export class Pddl4jParser extends Parser {
    constructor(private readonly jarLocation: string) {
        super({ executablePath: "java" });
    }

    protected getSyntax(): string[] {
        return ["-javaagent:" + this.jarLocation, "-server", "-Xms2048m", "-Xmx2048m", "fr.uga.pddl4j.parser.Parser", "-o", "$(domain)", "-f", "$(problem)"];
    }

    protected createPatternMatchers(context: ParserRunContext): ProblemPattern[] {
        const filePaths = context.fileNameMap.getFilePaths();

        const pattern = `/(error|warning) at line (\\d+), column (\\d+), file \\(($(filePaths))\\)\\s*:\\s*(.+)/ig/4,1,2,3,5`;

        return [new ProblemPattern(pattern, filePaths)];
    }
}

export class MockParser extends Parser {
    constructor() {
        super({ executablePath: 'node', cwd: 'test' });
    }

    protected getSyntax(): string[] {
        return ["mock-parser.js", "-d:$(domain)", "-p:$(problem)"];
    }

    protected createPatternMatchers(context: ParserRunContext): ProblemPattern[] {
        const filePaths = context.fileNameMap.getFilePaths();

        // val parser pattern
        return [new ProblemPattern(`/^($(filePaths))\\s*:\\s*line\\s*:\\s*(\\d*)\\s*:\\s*(Error|Warning)\\s*:\\s*(.*)$/gmi/1,3,2,0,4`, filePaths)];
    }
}