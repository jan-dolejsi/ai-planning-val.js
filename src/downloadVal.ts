#!/usr/bin/env node
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Architecture, DARWIN, LINUX, Platform, ValDownloader, WIN32, writeValManifest, X32, X64 } from './ValDownloader';
import yargs from 'yargs';
import path from 'path';

/** 
 * This script wraps the `ValDownloader` into a Node.js command-line utility. 
 * This is CLI is used by the CI workflow!
 */

const argv = yargs.option('buildId', {
    description: 'VAL Build ID (see ID of the latest from https://dev.azure.com/schlumberger/ai-planning-validation/_build/latest?definitionId=2&branchName=master)',
    default: 60,
    type: "number"
}).option('destination', {
    description: 'Target for the binaries to be unzipped into',
    type: "string",
    default: '.'
}).option('platform', {
    description: 'Optionally specify the platform (defaults to the local machine operating system)',
    choices: [WIN32, LINUX, DARWIN],
    default: undefined,
    type: "string"
}).option('architecture', {
    description: 'Optionally specify the CPU architecture (defaults to local machine CPU architecture)',
    choices: [X32, X64],
    default: undefined,
    type: "string"
})
    .help()
    .argv;

async function download(buildId: number, destination: string, platform?: Platform, architecture?: Architecture): Promise<void> {
    const manifest = await new ValDownloader().download(buildId, destination, platform, architecture);
    if (!manifest) {
        throw new Error('Failed to download VAL.');
    }
    return await writeValManifest(path.join(destination, 'val.json'), manifest);
}

download(argv.buildId, argv.destination).catch(err => {
    console.error(err);
    process.exit(-1);
});