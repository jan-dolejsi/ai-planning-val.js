/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as tmp from 'tmp-promise';
import fs = require('fs');

export class PddlFactory {
    static createEmptyDomain(name: string): string {
        return `(define (domain ${name})
        (:requirements :strips )
        )`;
    }

    static createEmptyProblem(name: string, domainName: string): string {
        return `(define (problem ${name}) (:domain ${domainName})
        (:objects 
        )
        
        (:init
        )
        
        (:goal (and
            )
        )
        )
        `;
    }
}

export class Util {

    /**
     * Saves the `text` to temporary file.
     * @param text file text
     * @param options file creation options
     */
    static toFileSync(text: string, options: TempFileOptions): string {
        const tempFile = tmp.fileSync(Util.toTmpFileOptions(options));
        fs.writeSync(tempFile.fd, text, 0, 'utf8');
        return tempFile.name;
    }

    /**
     * Saves the `text` to temporary file.
     * @param text file text
     * @param options file creation options
     */
    static async toFile(text: string, options: TempFileOptions): Promise<string> {
        const tempFile = await tmp.file(Util.toTmpFileOptions(options));
        await fs.promises.writeFile(tempFile.path, text, { encoding: 'utf8' });
        return tempFile.path;
    }

    private static toTmpFileOptions(options: TempFileOptions) {
        return { mode: 0o644, prefix: (options.prefix ?? 'tmp') + '-', postfix: options.suffix, tmpdir: options.tmpdir };
    }

    /** 
     * Saves the text to a temporary .pddl file
     * @param text file text
     * @param options file name options
    */
    static toPddlFileSync(text: string, options: TempFileNameOptions): string {
        return Util.toFileSync(text, Object.assign(options, { suffix: '.pddl' }));
    }

    /** 
     * Saves the text to a temporary .pddl file
     * @param text file text
     * @param options file name options
    */
    static async toPddlFile(text: string, options: TempFileNameOptions): Promise<string> {
        return Util.toFile(text, Object.assign(options, { suffix: '.pddl' }));
    }
}

export interface TempFileOptions extends TempFileNameOptions {
    /** File extension. It should start with a period character. */
    suffix: string;
}


export interface TempFileNameOptions {
    /** File prefix. If used, a hyphen will be added between the prefix and the generated temp file name. */
    prefix?: string;
    /** Allows you to override the system's root tmp directory. */
    tmpdir?: string;
}