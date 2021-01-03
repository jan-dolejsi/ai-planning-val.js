/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as process from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

import {
    utils, parser, ProblemInfo, TimedVariableValue, VariableValue,
    DomainInfo, Happening
} from 'pddl-workspace';

import { HappeningsToValStep } from './HappeningsToValStep';
import { Util } from './valUtils';

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

/** Valstep utility execution options. */
export interface ValStepOptions {
    /** Valstep executable path, if undefined 'ValStep' command will be used when spawning the process. */
    valStepPath?: string;
    /** Current directory. If undefined, the current process `cwd` will be used. */
    cwd?: string;
    /** Verbose mode (more logging to the console). Default is `false`. */
    verbose?: boolean;
}

export interface ValStepInteractiveOptions extends ValStepOptions {
    /** Timeout to wait for a state evaluation after happening burst was posted. Default: 500ms. */
    timeout?: number;
}

/**
 * Wraps the Valstep executable.
 */
export class ValStep extends EventEmitter {

    private childProcess: process.ChildProcess | undefined;
    private variableValues: TimedVariableValue[];
    private initialValues: TimedVariableValue[];
    private valStepInput = '';
    private outputBuffer = '';
    private happeningsConvertor: HappeningsToValStep;

    private static readonly QUIT_INSTRUCTION = 'q\n';
    public static HAPPENING_EFFECTS_EVALUATED = Symbol("HAPPENING_EFFECTS_EVALUATED");
    public static NEW_HAPPENING_EFFECTS = Symbol("NEW_HAPPENING_EFFECTS");

    /** Default file name */
    private readonly VALSTEP_EXE = 'ValStep';

    constructor(private domainInfo: DomainInfo, private problemInfo: ProblemInfo) {
        super();
        this.variableValues = problemInfo.getInits().map(v => TimedVariableValue.copy(v));
        this.initialValues = this.variableValues.map(v => TimedVariableValue.copy(v));
        this.happeningsConvertor = new HappeningsToValStep();
    }

    /**
     * Subscribe to the state update event.
     * @param callback state update callback
     * @returns `this`
     */
    onStateUpdated(callback: (happenings: Happening[], values: VariableValue[]) => void): ValStep {
        return this.on(ValStep.NEW_HAPPENING_EFFECTS, callback);
    }

    /**
     * Subscribe to the state update event (once).
     * @param callback state update callback
     * @returns `this`
     */
    onceStateUpdated(callback: (happenings: Happening[], values: VariableValue[]) => void): ValStep {
        return this.once(ValStep.NEW_HAPPENING_EFFECTS, callback);
    }

    /**
     * Executes series of plan happenings in one batch without waiting for incremental effect evaluation.
     * @param happenings plan happenings to play
     * @param options ValStep execution options
     * @returns final variable values, or undefined in case the ValStep fails
     */
    async executeBatch(happenings: Happening[], options?: ValStepOptions): Promise<TimedVariableValue[] | undefined> {
        if (this.childProcess) {
            throw new Error(`This ValStep instance was already used. Create new one`);
        }
        this.valStepInput = this.convertHappeningsToValStepInput(happenings);
        if (options?.verbose) {
            console.log("ValStep >>>" + this.valStepInput);
        }

        let args = await this.createValStepArgs();
        const valStepsPath = await Util.toFile('valSteps', '.valsteps', this.valStepInput);
        args = ['-i', valStepsPath, ...args];

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        return new Promise<TimedVariableValue[]>(async (resolve, reject) => {
            this.logValStepCommand(options, args);
            const child = that.childProcess = process.spawn(this.createValCommand(options), args, options);

            let outputtingProblem = false;
            if (!child.stdout) {
                reject(new Error(`ValStep child process has no 'stdout'`));
                console.log(child.kill() ? "ValStep killed" : "ValStep not killed yet.");
                return;
            }
            child.stdout.on('data', output => {
                const outputString = output.toString("utf8");
                if (options?.verbose) { console.log("ValStep <<<" + outputString); }
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
                // shift the time of the values to the plan makespan
                newValues?.forEach(v => v.update(that.happeningsConvertor.makespan, v.getVariableValue()));
                resolve(newValues);
            });
        });
    }

    createValCommand(options?: ValStepOptions): string {
        return options?.valStepPath ?? this.VALSTEP_EXE;
    }

    logValStepCommand(options: ValStepOptions | undefined, args: string[]): void {
        if (options?.verbose) {
            console.log(`ValStep command: ${this.createValCommand(options)}\nValStep args: ${args.join(' ')}\nValStep cwd: ${options.cwd}`);
        }
    }

    private convertHappeningsToValStepInput(happenings: Happening[]): string {
        const groupedHappenings = utils.Util.groupBy(happenings, (h: Happening) => h.getTime());

        let valStepInput = '';

        [...groupedHappenings.keys()]
            .sort((a, b) => a - b)
            .forEach((time, batchId) => {
                const happeningGroup = groupedHappenings.get(time);
                if (happeningGroup) {
                    const valSteps = this.happeningsConvertor.convert(happeningGroup, batchId);
                    valStepInput += valSteps;
                } else {
                    console.warn(`Did not find happening group corresponding to time ${time}.`);
                }
        });

        valStepInput += ValStep.QUIT_INSTRUCTION;

        return valStepInput;
    }

    /**
     * Executes series of plan happenings.
     * @param happenings plan happenings to play
     * @param options ValStep execution options
     * @returns final variable values, or null/undefined in case the tool fails
     */
    async execute(happenings: Happening[], options?: ValStepOptions): Promise<TimedVariableValue[]> {
        if (this.childProcess) {
            throw new Error(`This ValStep instance was already used. Create new one`);
        }
        const args = await this.createValStepArgs();

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        return new Promise<TimedVariableValue[]>(async (resolve, reject) => {
            this.logValStepCommand(options, args);
            const child = that.childProcess = process.execFile(this.createValCommand(options), args, { cwd: options?.cwd, timeout: 2000, maxBuffer: 2 * 1024 * 1024 }, async (error, stdout, stderr) => {
                if (error) {
                    reject(new ValStepError(error.message, this.domainInfo, this.problemInfo, this.valStepInput));
                    return;
                }
                if (options?.verbose) {
                    console.log(stdout);
                    console.log(stderr);
                }
                const eventualProblem = that.outputBuffer;
                const newValues = await that.extractInitialState(eventualProblem);
                resolve(newValues);
            });

            let outputtingProblem = false;

            child.stdout?.on('data', output => {
                if (options?.verbose) { console.log("ValStep <<<" + output); }
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
                        if (options?.verbose) {
                            console.log("ValStep >>>" + valSteps);
                        }
                    }
                    catch (err) {
                        if (options?.verbose) {
                            console.log("ValStep input causing error: " + valSteps);
                        }
                        reject('Sending happenings to valstep caused error: ' + err); return;
                    }
                }
                else {
                    console.warn(`Did not find happening group for time ${time}.`);
                }
            }

            this.valStepInput += ValStep.QUIT_INSTRUCTION;
            if (options?.verbose) {
                console.log("ValStep >>> " + ValStep.QUIT_INSTRUCTION);
            }
            child.stdin?.write(ValStep.QUIT_INSTRUCTION);
        });
    }

    /**
     * Parses the problem file and extracts the initial state.
     * @param problemText problem file content output by ValStep
     * @returns variable values array, or null if the tool failed
     */
    private async extractInitialState(problemText: string): Promise<TimedVariableValue[] | undefined> {
        const problemInfo = await parser.PddlProblemParser.parseText(problemText);

        if (!problemInfo) { return undefined; }

        return problemInfo.getInits();
    }

    private async startValStep(options?: ValStepOptions): Promise<process.ChildProcess> {
        if (this.childProcess) {
            throw new Error(`This ValStep instance was already used. Create new one`);
        }
        const args = await this.createValStepArgs();
        this.logValStepCommand(options, args);
        return this.childProcess = process.execFile(this.createValCommand(options), args, options);
    }

    /**
     * Executes series of plan happenings, while waiting for each burst of happenings (scheduled at the same time) to evaluate effects.
     * @param happenings plan happenings to play
     * @param options ValStep execution options
     * @returns final variable values
     */
    async executeIncrementally(happenings: Happening[], options?: ValStepOptions): Promise<TimedVariableValue[]> {
        if (this.childProcess) {
            throw new Error(`This ValStep instance was already used. Create new one`);
        }

        const child = await this.startValStep(options);

        // subscribe to the child process standard output stream and concatenate it till it is complete
        child.stdout?.on('data', output => {
            if (options?.verbose) { console.log("ValStep <<<" + output); }
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
                await this.postHappenings(happeningGroup, options);
            } else {
                console.warn(`Could not find happening group for time ${time}.`);
            }
        }

        child.stdin?.write('q\n');

        return this.variableValues;
    }

    private async createValStepArgs(): Promise<string[]> {
        // copy editor content to temp files to avoid using out-of-date content on disk
        try {
            const domainFilePath = await Util.toPddlFile('domain', this.domainInfo.getText());
            const problemFilePath = await Util.toPddlFile('problem', this.problemInfo.getText()); // todo: this is where we are sending un-pre-processed problem text when rendering plan

            const args = [domainFilePath, problemFilePath];
            return args;
        }
        catch (err) {
            console.log(err);
            throw err;
        }
    }

    /**
     * Posts happening interactively.
     * @param happenings happenings group (typically sharing the same timestamp)
     * @param options execution options
     */
    async postHappenings(happenings: Happening[], options?: ValStepInteractiveOptions): Promise<boolean> {
        if (!this.childProcess) {
            this.childProcess = await this.startValStep(options);
        }
        const childProcess = this.childProcess;

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
                options?.timeout ?? 500, lastHappeningTime);

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
                if (options?.verbose) { console.log("ValStep >>>" + valSteps); }
            }
            catch (err) {
                if (options?.verbose) { console.log("ValStep intput causing error: " + valSteps); }
                reject('Cannot post happenings to valstep: ' + err);
            }
        });
    }

    private applyIfNew(time: number, value: VariableValue): boolean {
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

    private throwValStepExitCode(code: number | null, signal: string | null): void {
        if (code !== null && code !== 0) {
            throw new ValStepExitCode(`ValStep exit code ${code} and signal ${signal}`);
        }
    }

    private throwValStepError(err: Error): void {
        throw new ValStepError(`ValStep failed with error ${err.name} and message ${err.message}`, this.domainInfo, this.problemInfo, this.valStepInput);
    }

    private readonly valStepOutputPattern = /^(?:(?:\? )?Posted action \d+\s+)*(?:\? )+Seeing (\d+) changed lits\s*([\s\S]*)\s+\?\s*$/m;
    private readonly valStepLiteralsPattern = /([\w-]+(?: [\w-]+)*) - now (true|false|[+-]?\d+\.?\d*(?:e[+-]?\d+)?)/g;

    private isOutputComplete(output: string): boolean {
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

    private parseEffects(happeningsEffectText: string): VariableValue[] {
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
        await utils.afs.mkdirIfDoesNotExist(casePath, 0o644);

        const domainFile = "domain.pddl";
        const problemFile = "problem.pddl";
        const inputFile = "happenings.valsteps";
        await fs.promises.writeFile(path.join(casePath, domainFile), err.domain.getText(), { encoding: "utf-8" });
        await fs.promises.writeFile(path.join(casePath, problemFile), err.problem.getText(), { encoding: "utf-8" });
        await fs.promises.writeFile(path.join(casePath, inputFile), err.valStepInput, { encoding: "utf-8" });

        const command = `:: The purpose of this batch file is to be able to reproduce the valstep error
type ${inputFile} | ${utils.Util.q(valStepPath)} ${domainFile} ${problemFile}
:: or for latest version of ValStep:
${utils.Util.q(valStepPath)} -i ${inputFile} ${domainFile} ${problemFile}`;

        await fs.promises.writeFile(path.join(casePath, "run.cmd"), command, { encoding: "utf-8" });
        return casePath;
    }
}
