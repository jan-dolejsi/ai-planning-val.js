import path from 'path';
import fs from 'fs';
import { readValManifest, ValVersion } from './src';


export const VAL_DOWNLOAD = 'val';

export async function getDownloadedManifest(): Promise<ValVersion> {
    const manifestPath = path.join(VAL_DOWNLOAD, 'val.json');
    if (!(fs.existsSync(manifestPath))) {
        console.error(`Expected ${manifestPath}`);
        throw new Error("VAL not downloaded");
    }
    return await readValManifest(manifestPath);
}

export function getValToolPath(valManifest: ValVersion,
    toolNameSupplier: (valManifest: ValVersion) => string | undefined): string {

    const downloadedToolPath = toolNameSupplier(valManifest);
    if (!downloadedToolPath) {
        throw new Error(`Tool not downloaded.`);
    }
    const toolPath = path.join(VAL_DOWNLOAD, downloadedToolPath);
    console.log(`Tool path ${toolPath} found in binary manifest: ${valManifest.buildId}`);
    return toolPath;
}

export function copyFileSync(source: string, target: string): void {

    let targetFile = target;

    // If target is a directory, a new file with the same name will be created
    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }

    fs.writeFileSync(targetFile, fs.readFileSync(source, { flag: 'r' }));
}

export function copyFolderRecursiveSync(source: string, target: string): void {
    let files = [];

    // Check if folder needs to be created or integrated
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    // Copy
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, target);
            } else {
                copyFileSync(curSource, target);
            }
        });
    }
}