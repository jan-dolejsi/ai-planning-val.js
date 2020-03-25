import { expect } from 'chai';
import { ValDownloader, readValManifest, writeValManifest } from './src';
import { utils } from 'pddl-workspace';
import path from 'path';
import fs from 'fs';

async function assertExists(targetDirectory: string, relativePath?: string, toolName?: string): Promise<void> {
    expect(relativePath, toolName + " should not be undefined.").to.not.be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const completePath = path.join(targetDirectory, relativePath!);
    const exists = await utils.afs.exists(completePath);
    expect(exists, `File ${completePath} should exist.`).to.be.equal(true);
}

const expectedBuildId = 37;
const VAL_DIRECTORY = 'val';
export const VAL_MANIFEST = path.join('.', VAL_DIRECTORY, 'val.json');

describe("ValDownloader", () => {

    describe("#download()", () => {

        it.skip("downloads build", async () => {
            utils.afs.mkdirIfDoesNotExist(VAL_DIRECTORY, 0x755);
            const downloadedVersion = await new ValDownloader().download(expectedBuildId, VAL_DIRECTORY);
            expect(downloadedVersion).to.not.be.undefined;

            if (downloadedVersion) {
                writeValManifest(VAL_MANIFEST, downloadedVersion);
                for (let i = 0; i < downloadedVersion.files.length; i++) {
                    await assertExists(VAL_DIRECTORY, downloadedVersion.files[i]);
                }

                await assertExists(VAL_DIRECTORY, downloadedVersion?.parserPath, "Parser");
                await assertExists(VAL_DIRECTORY, downloadedVersion?.valStep, "ValStep");
                await assertExists(VAL_DIRECTORY, downloadedVersion?.validatePath, "Validate");
                await assertExists(VAL_DIRECTORY, downloadedVersion?.valueSeqPath, "ValueSeq");
            }

            console.log(`Downloaded: ${downloadedVersion?.files.length}`);
            expect(downloadedVersion?.buildId).to.be.equal(expectedBuildId);
        }).timeout(10 * 1000);

        it("changed chmod", async () => {
            const manifest = await readValManifest(VAL_MANIFEST);
            expect(manifest.valStep, "valstep should be present").to.not.be.undefined;
            if (manifest.valStep) {
                fs.accessSync(path.join('.', VAL_DIRECTORY, manifest.valStep), fs.constants.X_OK);
            }
        });
    });
});
