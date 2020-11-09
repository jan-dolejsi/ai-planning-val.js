/* --------------------------------------------------------------------------------------------
* Copyright (c) Jan Dolejsi. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

/* This is a mock parser for testing purposes. It output the mock parser issues. */

console.dir(process.argv);

let domainFile;
let problemFile

process.argv.forEach(arg => {
    if (arg.startsWith('-d:')) {
        domainFile = arg.substring('-d:'.length);
    } else if (arg.startsWith('-p:')) {
        problemFile = arg.substring('-p:'.length);
    }
});

if (!domainFile) {
    console.error('domain not set');
    process.exit(-1);
}

if (!problemFile) {
    console.error('problem not set');
    process.exit(-1);
}

function output(file, line, severity, message) {
    console.log(`${file} : line: ${line}: ${severity}: ${message}`);
}

output(domainFile, 0, "Error", "error message...")
output(domainFile, 1, "Warning", "warning message...")

output(problemFile, 10, "Error", "error message...")
output(problemFile, 11, "Warning", "warning message...")

process.exit(0);