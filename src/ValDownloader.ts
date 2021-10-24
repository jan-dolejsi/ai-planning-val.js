/* eslint-disable @typescript-eslint/no-use-before-define */
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { utils } from 'pddl-workspace';
import * as fs from 'fs';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { getFile } from './httpUtils';

export class UnsupportedOperatingSystem implements Error {
    constructor(public readonly supportedOperatingSystems: string[], public readonly yourOperatingSystem: string, public readonly yourCpuArchitecture: string) {
    }
    get name(): string {
        return "UnsupportedOperatingSystem";
    }
    get message(): string {
        return `Binaries for operating system ${this.yourOperatingSystem} ${this.yourCpuArchitecture} are not available. Supported: ${this.supportedOperatingSystems.join(', ')}`;
    }
    stack?: string | undefined;
}

export const WIN32 = "win32";
export const LINUX = "linux";
export const DARWIN = "darwin";
export type Platform = "win32" | "linux" | "darwin" | undefined;
export const X64 = "x64";
export const X32 = "x32";
export type Architecture = "x64" | "x32" | undefined;

export class ValDownloader {

    static readonly VAL_BINARY_PROJECT = "https://dev.azure.com/schlumberger/ai-planning-validation";
    static readonly VAL_REPO = `https://github.com/KCL-Planning/VAL`;

    protected async downloadDelegate(url: string, zipPath: string, message: string): Promise<void> {
        console.log(message);
        return getFile(url, zipPath);
    }

    /**
     * Downloads given version of VAL.
     * @param buildId VAL build ID to download artifacts from
     * @param destinationDirectory Directory where VAL binaries are to be downloaded locally.
     * @param platform optionally specify the platform
     * @param architecture optionally specify the architecture
     */
    async download(buildId: number, destinationDirectory: string, platform?: Platform, architecture?: Architecture): Promise<ValVersion> {

        const artifactName = ValDownloader.getBuildArtifactName(platform, architecture);
        if (!artifactName) {
            throw this.unsupportedOperatingSystem();
        }
        await utils.afs.mkdirIfDoesNotExist(destinationDirectory, { mode: 0o755, recursive: true });

        const zipPath = path.join(destinationDirectory, "drop.zip");
        await utils.afs.mkdirIfDoesNotExist(path.dirname(zipPath), 0o755);

        const url = `https://dev.azure.com/schlumberger/4e6bcb11-cd68-40fe-98a2-e3777bfec0a6/_apis/build/builds/${buildId}/artifacts?artifactName=${artifactName}&api-version=5.2-preview.5&%24format=zip`;

        await this.downloadDelegate(url, zipPath, 'Downloading VAL tools...');
        console.log("Done downloading.");

        const dropEntries = await this.unzip(zipPath, destinationDirectory);
        console.log("Done unzipping.");

        const zipEntries = dropEntries
            .filter(entry => entry.endsWith('.zip'));

        if (zipEntries.length !== 1) {
            throw new Error(`Binary archive contains unexpected number of zip entries: ${zipEntries.length}. Content: ${dropEntries}`);
        }

        const valZipFileName = zipEntries[0];
        console.log(`Zip found ${valZipFileName}`);

        const versionMatch = /^Val-(\d{8}\.\d+(\.DRAFT)?(-Linux)?)/.exec(path.basename(valZipFileName));
        if (!versionMatch) {
            throw new Error("Binary archive version does not conform to the expected pattern: " + valZipFileName);
        }

        const version = versionMatch[1];

        const valToolFileNames = await this.decompress(path.join(destinationDirectory, valZipFileName), destinationDirectory);

        console.log(`Val binaries unzipped to directory: ${path.join(process.cwd(), destinationDirectory)}`);

        // clean-up and delete the drop content
        await ValDownloader.deleteAll(dropEntries.map(file => path.join(destinationDirectory, file)));

        // delete the drop zip
        await fs.promises.unlink(zipPath);

        const manifest: ValVersion = {
            buildId: buildId, version: version, files: valToolFileNames,
            parserPath: findValToolPath(valToolFileNames, PARSER_FILE_NAME),
            validatePath: findValToolPath(valToolFileNames, VALIDATE_FILE_NAME),
            valueSeqPath: findValToolPath(valToolFileNames, VALUE_SEQ_FILE_NAME),
            valStepPath: findValToolPath(valToolFileNames, VAL_STEP_FILE_NAME)
        };

        this.allowExecution(destinationDirectory, manifest);

        return manifest;
    }

    async decompress(compressedFilePath: string, destinationDirectory: string): Promise<string[]> {
        if (compressedFilePath.endsWith(".zip")) {
            return this.unzip(compressedFilePath, destinationDirectory);
        }
        else {
            throw new Error(`VAL tools were downloaded to ${compressedFilePath}, and must be de-compressed and configured manually.`);
        }
    }

    private async unzip(zipPath: string, destinationDirectory: string): Promise<string[]> {
        console.log(`Unzipping ${zipPath} to ${destinationDirectory}`);
        const zip = new AdmZip(zipPath);
        const entryNames = zip.getEntries()
            .filter(entry => !entry.isDirectory)
            .map(entry => entry.entryName);

        console.log(`Unzipping ${entryNames.join(', ')}`);

        zip.extractAllTo(destinationDirectory, true);
        console.log(`Unzipped ${entryNames.join(', ')}`);

        return entryNames;

        // return await new Promise<string[]>((resolve, reject) => {
        //     zip.extractAllToAsync(destinationDirectory, true, err => {
        //         console.log(`Done unzipping to ${destinationDirectory}, err: ${err}`)
        //         if (err) {
        //             reject(err);
        //             return;
        //         }
        //         else {
        //             resolve(entryNames);
        //         }
        //     });
        // });
    }

    static async deleteAll(files: string[]): Promise<void> {
        // 1. delete downloaded files
        const deletionPromises = files
            .filter(file => fs.existsSync(file))
            .map(async file => await fs.promises.unlink(file));
        await Promise.all(deletionPromises);

        // 2. delete empty directories
        const directories = [...new Set(files.map(file => path.dirname(file)))];
        const emptyDirectories = directories
            // sorted from longest to shortest to delete sub-directories first
            .sort((a, b) => b.length - a.length);

        for (const directory of emptyDirectories) {
            if (await utils.afs.exists(directory) && await utils.afs.isEmpty(directory)) {
                await fs.promises.rmdir(directory);
            }
        }
    }

    /**
     * Calculates the artifact name for this computer, or given the specified `platform` and `architecture`.
     * @param platform optionally specify the platform
     * @param architecture optionally specify the architecture
     */
    private static getBuildArtifactName(platform?: Platform, architecture?: Architecture): string | null {
        switch (platform ?? os.platform()) {
            case WIN32:
                switch (architecture ?? os.arch()) {
                    case X64:
                        return "win64";
                    case X32:
                    case "ia32":
                        return WIN32;
                    default:
                        return null;
                }
            case LINUX:
                switch (architecture ?? os.arch()) {
                    case X64:
                        return "linux64";
                    default:
                        return null;
                }
            case DARWIN:
                switch (architecture ?? os.arch()) {
                    case X64:
                        return "macos64";
                    default:
                        return null;
                }
            default:
                return null;
        }
    }

    private allowExecution(targetDirectory: string, manifest: ValVersion): void {
        const executePermission = fs.constants.S_IXUSR | fs.constants.S_IRGRP;
        [manifest.parserPath, manifest.valStepPath, manifest.validatePath, manifest.valueSeqPath]
            .filter(tool => !!tool)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .map(tool => tool!)
            .forEach(tool => {
                fs.chmodSync(path.join(targetDirectory, tool), executePermission)
            });
    }

    private unsupportedOperatingSystem(): UnsupportedOperatingSystem {
        return new UnsupportedOperatingSystem(["win32 (arch: x64, x32, ia32)", "linux (arch: x64)", "darwin (x64)"], os.platform(), os.arch());
    }
}

const PARSER_FILE_NAME = "Parser";
const VALIDATE_FILE_NAME = "Validate";
const VALUE_SEQ_FILE_NAME = "ValueSeq";
const VAL_STEP_FILE_NAME = "ValStep";

export interface ValVersion {
    readonly buildId: number;
    readonly version: string;
    readonly files: string[];
    readonly parserPath?: string;
    readonly validatePath?: string;
    readonly valueSeqPath?: string;
    readonly valStepPath?: string;
}

/**
 * Finds the path of given VAL tool in the given version.
 * @param allFiles all downloaded VAL files (relative paths)
 * @param toolName tool name for which we are looking for its path
 * @returns corresponding path, or _undefined_ if the _valVersion_ argument is null or undefined
 */
function findValToolPath(allFiles: string[] | undefined, toolName: string): string | undefined {
    if (!allFiles) { return undefined; }
    const pattern = new RegExp("\\b" + toolName + "(?:\\.exe)?$");
    return allFiles.find(filePath => pattern.test(filePath));
}

export async function readValManifest(manifestPath: string): Promise<ValVersion> {
    try {
        const versionAsString = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        return JSON.parse(versionAsString);
    }
    catch (err: unknown) {
        if (err instanceof Error) {
            throw new Error(`Error reading VAL manifest ${err.name}: ${err.message}`);
        } else {
            throw err;
        }
    }
}

export async function writeValManifest(manifestPath: string, valVersion: ValVersion): Promise<void> {
    const json = JSON.stringify(valVersion, null, 2);
    try {
        console.log(`Saving Manifest to ${manifestPath}`);
        await fs.promises.writeFile(manifestPath, json, { encoding: 'utf8' });
        console.log(`Manifest saved to ${manifestPath}`);
    }
    catch (err) {
        if (err instanceof Error) {
            throw new Error(`Error saving VAL manifest ${err.name}: ${err.message}`);
        } else {
            throw err;
        }
    }
}

