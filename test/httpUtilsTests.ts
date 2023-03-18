import { expect } from 'chai';
import { getText } from './src';
import { URL } from 'url';

describe.only("httpUtils", () => {

    describe("#getText()", () => {

        it("downloads page", async () => {
            const text = await getText(new URL('https://en.wikipedia.org/wiki/Automated_planning_and_scheduling'), { expectedContentType: /^text\/html/});
            
            expect(text).to.not.be.undefined;
        }).timeout(10 * 1000).retries(3);
    });
});
