/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as process from 'child_process';
import { EventEmitter } from 'events';

import { utils } from 'pddl-workspace';
import * as path from 'path';
import { parser } from 'pddl-workspace';
import { ProblemInfo, TimedVariableValue, VariableValue } from 'pddl-workspace';
import { DomainInfo } from 'pddl-workspace';
import { Happening } from 'pddl-workspace';
import { SimpleDocumentPositionResolver } from 'pddl-workspace';

import { HappeningsToValStep } from './HappeningsToValStep';

export class ValStepError extends Error {
    constructor(public readonly message: string, public readonly domain: DomainInfo,
        public readonly problem: ProblemInfo, public readonly valStepInput: string) {
        super(message);
    }
}

export class ValStepExitCode extends Error {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Wraps the Valstep executable.
 */
export class ValStep extends EventEmitter {

    private variableValues: TimedVariableValue[];
    private initialValues: TimedVariableValue[];
    private valStepInput = '';
    private outputBuffer = '';
    private happeningsConvertor: HappeningsToValStep;
    private verbose = false;
    private static readonly quitInstruction = 'q\n';

    public static HAPPENING_EFFECTS_EVALUATED = Symbol("HAPPENING_EFFECTS_EVALUATED");
    public static NEW_HAPPENING_EFFECTS = Symbol("NEW_HAPPENING_EFFECTS");

    constructor(private domainInfo: DomainInfo, private problemInfo: ProblemInfo) {
        super();
        this.variableValues = problemInfo.getInits().map(v => TimedVariableValue.copy(v));
        this.initialValues = this.variableValues.map(v => TimedVariableValue.copy(v));
        this.happeningsConvertor = new HappeningsToValStep();
    }

    /**
     * Executes series of plan happenings in one batch.
     * @param valStepPath valstep path from configuration
     * @param cwd current working directory
     * @param happenings plan happenings to play
     * @returns final variable values, or null in case the tool fails
     */
    async executeBatch(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        this.valStepInput = this.convertHappeningsToValStepInput(happenings);
        if (this.verbose) {
            console.log("ValStep >>>" + this.valStepInput);
        }

        let args = await this.createValStepArgs();
        const valStepsPath = await utils.Util.toPddlFile('valSteps', this.valStepInput);
        args = ['-i', valStepsPath, ...args];

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        
        return new Promise<TimedVariableValue[]>(async (resolve, reject) => {
            const child = process.spawn(valStepPath, args, { cwd: cwd });

            let outputtingProblem = false;

            child.stdout.on('data', output => {
                const outputString = output.toString("utf8");
                if (that.verbose) { console.log("ValStep <<<" + outputString); }
                if (outputtingProblem) {
                    that.outputBuffer += outputString;
                } else if (outputString.indexOf('(define (problem') >= 0) {
                    that.outputBuffer = outputString.substr(outputString.indexOf('(define (problem'));
                    outputtingProblem = true;
                }
            });

            child.on("error", error => 
                reject(new ValStepError(error.message, this.domainInfo, this.problemInfo, this.valStepInput))
            );

            child.on("close", async (code, signal) => {
                if (code !== 0) {
                    console.log(`ValStep exit code: ${code}, signal: ${signal}.`);
                }
                const eventualProblem = that.outputBuffer;
                const newValues = await that.extractInitialState(eventualProblem);
                resolve(newValues);
            });
        });
    }

    private convertHappeningsToValStepInput(happenings: Happening[]): string {
        const groupedHappenings = utils.Util.groupBy(happenings, (h: Happening) => h.getTime());

        let valStepInput = '';

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            if (happeningGroup) {
                const valSteps = this.happeningsConvertor.convert(happeningGroup);
                valStepInput += valSteps;
            } else {
                console.warn(`Did not find happening group corresponding to time ${time}.`);
            }
        }

        valStepInput += ValStep.quitInstruction;

        return valStepInput;
    }

    /**
     * Executes series of plan happenings.
     * @param valStepPath valstep path from configuration
     * @param cwd current working directory
     * @param happenings plan happenings to play
     * @returns final variable values, or null in case the tool fails
     */
    async execute(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        const args = await this.createValStepArgs();

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        return new Promise<TimedVariableValue[]>(async (resolve, reject) => {
            const child = process.execFile(valStepPath, args, { cwd: cwd, timeout: 2000, maxBuffer: 2 * 1024 * 1024 }, async (error, stdout, stderr) => {
                if (error) {
                    reject(new ValStepError(error.message, this.domainInfo, this.problemInfo, this.valStepInput));
                    return;
                }
                if (that.verbose) {
                    console.log(stdout);
                    console.log(stderr);
                }
                const eventualProblem = that.outputBuffer;
                const newValues = await that.extractInitialState(eventualProblem);
                resolve(newValues);
            });

            let outputtingProblem = false;

            child.stdout?.on('data', output => {
                if (this.verbose) { console.log("ValStep <<<" + output); }
                if (outputtingProblem) {
                    this.outputBuffer += output;
                } else if (output.indexOf('(define (problem') >= 0) {
                    this.outputBuffer = output.substr(output.indexOf('(define (problem'));
                    outputtingProblem = true;
                }
            });

            const groupedHappenings = utils.Util.groupBy(happenings, (h: Happening) => h.getTime());

            for (const time of groupedHappenings.keys()) {
                const happeningGroup = groupedHappenings.get(time);
                if (happeningGroup) {
                    const valSteps = this.happeningsConvertor.convert(happeningGroup);
                    this.valStepInput += valSteps;
                    
                    try {
                        if (!child.stdin?.write(valSteps)) {
                            reject('Failed to post happenings to valstep'); return;
                        }
                        if (this.verbose) {
                            console.log("ValStep >>>" + valSteps);
                        }
                    }
                    catch (err) {
                        if (this.verbose) {
                            console.log("ValStep input causing error: " + valSteps);
                        }
                        reject('Sending happenings to valstep caused error: ' + err); return;
                    }
                }
                else {
                    console.warn(`Did not find happening group for time ${time}.`);
                }
            }

            this.valStepInput += ValStep.quitInstruction;
            if (this.verbose) {
                console.log("ValStep >>> " + ValStep.quitInstruction);
            }
            child.stdin?.write(ValStep.quitInstruction);
        });
    }

    /**
     * Parses the problem file and extracts the initial state.
     * @param problemText problem file content output by ValStep
     * @returns variable values array, or null if the tool failed
     */
    private async extractInitialState(problemText: string): Promise<TimedVariableValue[] | undefined> {
        const syntaxTree = new parser.PddlSyntaxTreeBuilder(problemText).getTree();
        const problemInfo = await new parser.Parser().tryProblem("eventual-problem://not-important", 0, problemText, syntaxTree, new SimpleDocumentPositionResolver(problemText));

        if (!problemInfo) { return undefined; }

        return problemInfo.getInits();
    }

    async executeIncrementally(valStepPath: string, cwd: string, happenings: Happening[]): Promise<TimedVariableValue[]> {
        const args = await this.createValStepArgs();
        const child = process.execFile(valStepPath, args, { cwd: cwd });

        // subscribe to the child process standard output stream and concatenate it till it is complete
        child.stdout?.on('data', output => {
            if (this.verbose) { console.log("ValStep <<<" + output); }
            this.outputBuffer += output;
            if (this.isOutputComplete(this.outputBuffer)) {
                const variableValues = this.parseEffects(this.outputBuffer);
                this.outputBuffer = ''; // reset the output buffer
                this.emit(ValStep.HAPPENING_EFFECTS_EVALUATED, variableValues);
            }
        });

        // subscribe to the process exit event to be able to report possible crashes
        child.on("error", err => this.throwValStepError(err));
        child.on("exit", (code, signal) => this.throwValStepExitCode(code, signal));

        const groupedHappenings = utils.Util.groupBy(happenings, (h: Happening) => h.getTime());

        for (const time of groupedHappenings.keys()) {
            const happeningGroup = groupedHappenings.get(time);
            if (happeningGroup) {
                await this.postHappeningsInteractively(child, happeningGroup);
            } else {
                console.warn(`Could not find happening group for time ${time}.`);
            }
        }

        child.stdin?.write('q\n');

        return this.variableValues;
    }

    private async createValStepArgs(): Promise<string[]> {
        // copy editor content to temp files to avoid using out-of-date content on disk
        const domainFilePath = await utils.Util.toPddlFile('domain', this.domainInfo.getText());
        const problemFilePath = await utils.Util.toPddlFile('problem', this.problemInfo.getText()); // todo: this is where we are sending un-pre-processed problem text when rendering plan

        const args = [domainFilePath, problemFilePath];
        return args;
    }

    private async postHappeningsInteractively(childProcess: process.ChildProcess, happenings: Happening[]): Promise<boolean> {
        const valSteps = this.happeningsConvertor.convert(happenings);
        this.valStepInput += valSteps;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        return new Promise<boolean>((resolve, reject) => {
            const lastHappening = happenings[happenings.length - 1];
            const lastHappeningTime = lastHappening.getTime();

            const timeOut = setTimeout(
                lastHappeningTime1 => {
                    childProcess.kill();
                    reject(`ValStep did not respond to happenings @ ${lastHappeningTime1}`);
                    return;
                },
                500, lastHappeningTime);

            // subscribe to the valstep child process updates
            that.once(ValStep.HAPPENING_EFFECTS_EVALUATED, (effectValues: VariableValue[]) => {
                clearTimeout(timeOut);
                const newValues = effectValues.filter(v => that.applyIfNew(lastHappeningTime, v));
                if (newValues.length > 0) {
                    this.emit(ValStep.NEW_HAPPENING_EFFECTS, happenings, newValues);
                }
                resolve(true);
            });

            try {
                if (!childProcess.stdin?.write(valSteps)) {
                    reject('Cannot post happenings to valstep');
                }
                if (this.verbose) { console.log("ValStep >>>" + valSteps); }
            }
            catch (err) {
                if (this.verbose) { console.log("ValStep intput causing error: " + valSteps); }
                reject('Cannot post happenings to valstep: ' + err);
            }
        });
    }

    applyIfNew(time: number, value: VariableValue): boolean {
        const currentValue = this.variableValues.find(v => v.getVariableName().toLowerCase() === value.getVariableName().toLowerCase());
        if (currentValue === undefined) {
            this.variableValues.push(TimedVariableValue.from(time, value));
            return true;
        }
        else {
            if (value.getValue() === currentValue.getValue()) {
                return false;
            }
            else {
                currentValue.update(time, value);
                return true;
            }
        }
    }

    throwValStepExitCode(code: number | null, signal: string | null): void {
        if (code !== null && code !== 0) {
            throw new ValStepExitCode(`ValStep exit code ${code} and signal ${signal}`);
        }
    }

    throwValStepError(err: Error): void {
        throw new ValStepError(`ValStep failed with error ${err.name} and message ${err.message}`, this.domainInfo, this.problemInfo, this.valStepInput);
    }

    valStepOutputPattern = /^(?:(?:\? )?Posted action \d+\s+)*(?:\? )+Seeing (\d+) changed lits\s*([\s\S]*)\s+\?\s*$/m;
    valStepLiteralsPattern = /([\w-]+(?: [\w-]+)*) - now (true|false|[+-]?\d+\.?\d*(?:e[+-]?\d+)?)/g;

    isOutputComplete(output: string): boolean {
        this.valStepOutputPattern.lastIndex = 0;
        const match = this.valStepOutputPattern.exec(output);
        if (match && match[2]) {
            const expectedChangedLiterals = parseInt(match[1]);
            const changedLiterals = match[2];

            if (expectedChangedLiterals === 0) { return true; } // the happening did not have any effects

            this.valStepLiteralsPattern.lastIndex = 0;
            const actualChangedLiterals = changedLiterals.match(this.valStepLiteralsPattern)?.length ?? 0;

            return expectedChangedLiterals <= actualChangedLiterals; // functions are not included in the expected count
        }
        else {
            return false;
        }
    }

    parseEffects(happeningsEffectText: string): VariableValue[] {
        const effectValues: VariableValue[] = [];

        this.valStepOutputPattern.lastIndex = 0;
        const match = this.valStepOutputPattern.exec(happeningsEffectText);
        if (match) {
            const changedLiterals = match[2];

            this.valStepLiteralsPattern.lastIndex = 0;
            let match1: RegExpExecArray | null;
            while (match1 = this.valStepLiteralsPattern.exec(changedLiterals)) {
                const variableName = match1[1];
                const valueAsString = match1[2];
                let value: number | boolean;

                if (valueAsString === "true") {
                    value = true;
                }
                else if (valueAsString === "false") {
                    value = false;
                }
                else if (!isNaN(parseFloat(valueAsString))) {
                    value = parseFloat(valueAsString);
                }
                else {
                    console.warn(`Unexpected variable value: '${valueAsString}' in ${changedLiterals}`);
                    value = Number.NaN;
                }

                effectValues.push(new VariableValue(variableName, value));
            }

            return effectValues;
        }
        else {
            throw new Error(`ValStep output does not parse: ${happeningsEffectText}`);
        }
    }

    getUpdatedValues(): TimedVariableValue[] {
        return this.variableValues
            .filter(value1 => this.changedFromInitial(value1));
    }

    changedFromInitial(value1: TimedVariableValue): boolean {
        return !this.initialValues.some(value2 => value1.sameValue(value2));
    }

    static async storeError(err: ValStepError, targetDirectoryFsPath: string, valStepPath: string): Promise<string> {
        const targetDir = targetDirectoryFsPath;
        const caseDir = 'valstep-' + new Date().toISOString().split(':').join('-');
        const casePath = path.join(targetDir, caseDir);
        utils.afs.mkdirIfDoesNotExist(casePath, 0o644);

        const domainFile = "domain.pddl";
        const problemFile = "problem.pddl";
        const inputFile = "happenings.valsteps";
        await utils.afs.writeFile(path.join(casePath, domainFile), err.domain.getText(), { encoding: "utf-8" });
        await utils.afs.writeFile(path.join(casePath, problemFile), err.problem.getText(), { encoding: "utf-8" });
        await utils.afs.writeFile(path.join(casePath, inputFile), err.valStepInput, { encoding: "utf-8" });

        const command = `:: The purpose of this batch file is to be able to reproduce the valstep error
type ${inputFile} | ${utils.Util.q(valStepPath)} ${domainFile} ${problemFile}
:: or for latest version of ValStep:
${utils.Util.q(valStepPath)} -i ${inputFile} ${domainFile} ${problemFile}`;

        await utils.afs.writeFile(path.join(casePath, "run.cmd"), command, { encoding: "utf-8" });
        return casePath;
    }
}
