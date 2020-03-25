import { expect } from 'chai';
import { ValDownloader, writeValManifest } from './src';
import { utils } from 'pddl-workspace';
import path from 'path';

async function assertExists(targetDirectory: string, relativePath?: string, toolName?: string): Promise<void> {
    expect(relativePath, toolName + " should not be undefined.").to.not.be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const completePath = path.join(targetDirectory, relativePath!);
    const exists = await utils.afs.exists(completePath);
    expect(exists, `File ${completePath} should exist.`).to.be.equal(true);
}

const expectedBuildId = 37;
export const VAL_DIRECTORY = `build${expectedBuildId}`;
export const VAL_MANIFEST = path.join(VAL_DIRECTORY, 'val.json');

describe.skip("ValDownloader", () => {

    describe("#download()", () => {

        it("downloads build", async () => {
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

            console.log(downloadedVersion?.files);
            expect(downloadedVersion?.buildId).to.be.equal(expectedBuildId);
        }).timeout(60 * 1000);
    });
});
