/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-use-before-define */

import * as process from 'child_process';

import {
    utils, ProblemInfo,
    DomainInfo,
    ParsingProblem,
} from 'pddl-workspace';

import { URI } from 'vscode-uri';
import { ProblemPattern } from './ProblemPattern';
import { PddlFactory, Util } from './valUtils';

export class ParserError extends Error {
    constructor(public readonly message: string, public readonly domain: DomainInfo,
        public readonly problem?: ProblemInfo) {
        super(message);
    }
}

export class ParserExitCode extends Error {
    constructor(message: string) {
        super(message);
    }
}

/** Parser utility execution options. */
export interface ParserOptions {
    /** Parser executable path, if undefined 'Parser' command will be used when spawning the process. */
    executablePath?: string;
    /** Current directory. If undefined, the current process `cwd` will be used. */
    cwd?: string;
}

/** PDDL domain and problem parser. */
export class Parser {

    constructor(private options: ParserOptions) {
    }

    protected getSyntax(): string[] {
        return ["$(domain)", "$(problem)"];
    }

    async validate(domainInfo: DomainInfo, problemInfo?: ProblemInfo): Promise<ParsingProblems> {
        const origDomain = domainInfo.getText();
        const compiledDomain = domainInfo.getCompilations().applyAll(origDomain);
        const domainFilePath = Util.toPddlFileSync(compiledDomain, { prefix: "domain" });

        const parsingProblems = new ParsingProblems();

        if (!problemInfo) {
            const problemFilePath = Util.toPddlFileSync(PddlFactory.createEmptyProblem('dummy', domainInfo.name), { prefix: "problem" });

            const context: ParserRunContext = {
                domain: domainInfo,
                problem: problemInfo,
                fileNameMap: new FileNameToUriMap(domainFilePath, domainInfo.fileUri)
            }

            return await this.validateProblem(domainFilePath, problemFilePath, context, parsingProblems);
        }
        else {
            const problemFilePath = Util.toPddlFileSync(problemInfo.getText(), { prefix: "problem" });

            const context: ParserRunContext = {
                domain: domainInfo,
                problem: problemInfo,
                fileNameMap: new FileNameToUriMap(domainFilePath, domainInfo.fileUri).addProblem(problemFilePath, problemInfo.fileUri)
            }

            return await this.validateProblem(domainFilePath, problemFilePath, context, parsingProblems);
        }
    }

    static readonly OUTPUT_PATTERN = `/^($(filePaths))\\s*:\\s*line\\s*:\\s*(\\d*)\\s*:\\s*(Error|Warning)\\s*:\\s*(.*)$/gmi/1,3,2,0,4`;

    protected createPatternMatchers(context: ParserRunContext): ProblemPattern[] {
        const filePaths = context.fileNameMap.getFilePaths();

        return [new ProblemPattern(Parser.OUTPUT_PATTERN, filePaths)];
    }

    private processOutput(output: string, context: ParserRunContext, parsingProblems: ParsingProblems): void {
        const distinctOutputs: string[] = [];

        const patterns = this.createPatternMatchers(context);

        patterns.forEach(pattern => {
            let match: RegExpExecArray | null;
            while (match = pattern.regEx.exec(output)) {
                // only report each warning/error once
                if (distinctOutputs.includes(match[0])) { continue; }
                distinctOutputs.push(match[0]);

                const uri = context.fileNameMap.getUri(pattern.getFilePath(match));

                if (!uri) { continue; } // this is not a file of interest

                const parsingProblem = new ParsingProblem(pattern.getMessage(match), pattern.getSeverity(match), pattern.getRange(match));

                if (parsingProblems.has(uri)) {
                    parsingProblems.get(uri)?.push(parsingProblem);
                } else {
                    parsingProblems.set(uri, [parsingProblem]);
                }
            }
        });
    }

    private async validateProblem(domainFilePath: string, problemFilePath: string, context: ParserRunContext, parsingProblems: ParsingProblems): Promise<ParsingProblems> {
        const syntaxFragments = this.getSyntax();
        if (syntaxFragments.length < 1) {
            throw new Error('Parser syntax pattern should include $(domain) and $(problem) macros');
        }

        const args = syntaxFragments
            .map(fragment => {
                return fragment
                    .replace(/\$\(parser\)/i, "") // ignore '$(parser)'
                    .replace(/\$\(domain\)/i, domainFilePath)
                    .replace(/\$\(problem\)/i, problemFilePath);
            });

        return await this.runProcess(args, context, parsingProblems);
    }

    private async runProcess(args: string[], context: ParserRunContext, parsingProblems: ParsingProblems): Promise<ParsingProblems> {
        return new Promise<ParsingProblems>((resolve, reject) => {
            const exePath = this.options.executablePath ?? "Parser";
            // console.log(`${exePath} ` + args.join(' '));
            const child = process.spawn(exePath, args, { cwd: this.options.cwd });

            let trailingLine = '';

            child.stdout.on('data', output => {
                const outputString = trailingLine + output.toString("utf8");
                this.processOutput(outputString, context, parsingProblems);
                trailingLine = outputString.substring(outputString.lastIndexOf('\n'));
            });

            child.on("error", error => {
                if (!child.killed) {
                    reject(error.message);
                }
                resolve(parsingProblems);
            });

            child.on("close", (code, signal) => {
                if (code !== 0) {
                    console.warn(`Parser exit code: ${code}, signal: ${signal}.`);
                }
                resolve(parsingProblems);
            });
        });
    }
}

export interface ParserRunContext {
    domain: DomainInfo;
    problem?: ProblemInfo;
    fileNameMap: FileNameToUriMap;
}

class ParsingProblems extends utils.StringifyingMap<URI, ParsingProblem[]> {
    protected stringifyKey(key: URI): string {
        return key.toString();
    }
}

class FileNameToUriMap {

    private map = new Map<string, URI>();

    constructor(domainFilePath: string, uri: URI) {
        this.map.set(domainFilePath, uri);
    }

    addProblem(problemFilePath: string, uri: URI): FileNameToUriMap {
        this.map.set(problemFilePath, uri);
        return this;
    }

    getFilePaths(): string[] {
        return [...this.map.keys()];
    }

    getUri(filePath: string): URI | undefined {
        return this.map.get(filePath);
    }
}