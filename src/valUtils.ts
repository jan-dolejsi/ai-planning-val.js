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

    static toFileSync(prefix: string, suffix: string, text: string): string {
        const tempFile = tmp.fileSync({ mode: 0o644, prefix: prefix + '-', postfix: suffix });
        fs.writeSync(tempFile.fd, text, 0, 'utf8');
        return tempFile.name;
    }

    static async toFile(prefix: string, suffix: string, text: string): Promise<string> {
        const tempFile = await tmp.file({ mode: 0o644, prefix: prefix + '-', postfix: suffix });
        await fs.promises.writeFile(tempFile.path, text, { encoding: 'utf8' });
        return tempFile.path;
    }

    static toPddlFileSync(prefix: string, text: string): string {
        return Util.toFileSync(prefix, '.pddl', text);
    }

    static async toPddlFile(prefix: string, text: string): Promise<string> {
        return Util.toFile(prefix, '.pddl', text);
    }
}