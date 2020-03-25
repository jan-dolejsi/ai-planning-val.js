import path from 'path';
import fs from 'fs';
import { readValManifest, ValVersion } from './src';


const VAL_DOWNLOAD = 'val';

export async function getDownloadedManifest(): Promise<ValVersion> {
    const manifestPath = path.join(VAL_DOWNLOAD, 'val.json');
    if (!(fs.existsSync(manifestPath))) {
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
