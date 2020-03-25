/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { HappeningsInfo, Happening, HappeningType } from 'pddl-workspace';
import { utils } from 'pddl-workspace';

export class HappeningsToValStep {
    durativeActionCounter = 0;
    durativeActionIndex = new Map<string, number>();
    valStepText: string[] = [];
    makespan = -1;

    convertAllHappenings(happenings: HappeningsInfo): void {
        this.convert(happenings.getHappenings());
    }

    convert(happenings: Happening[], batchId?: number): string {
        const header = [];
        const footer = [];
        if (batchId !== undefined) { 
            const minTime = Math.min(...happenings.map(h => h.getTime()));
            const maxTime = Math.max(...happenings.map(h => h.getTime()));
            const message = `batch [${batchId}]: ${happenings.length} happening(s) from time ${minTime} up to time ${maxTime}.`;
            header.push('e Posting ' + message);
            footer.push('e Executed ' + message);
        }
        const newSteps = happenings.map(h => this.happeningToValStep(h));
        
        const newStepsFlatten = utils.Util.flatMap(newSteps);
        newStepsFlatten.push('x');
        
        const valStepInstructions = utils.Util.flatMap([header, newStepsFlatten, footer]);
        this.valStepText = this.valStepText.concat(valStepInstructions);
        return valStepInstructions.join('\n') + '\n';
    }

    getExportedText(andQuit: boolean): string {

        if (andQuit) {
            this.valStepText.push('q');
        }

        return this.valStepText.join('\n') + '\n';
    }

    private happeningToValStep(h: Happening): string[] {
        const newValStepText: string[] = [];

        switch (h.getType()) {
            case HappeningType.START:
            case HappeningType.INSTANTANEOUS:
                this.durativeActionCounter += 1;
                this.durativeActionIndex.set(this.toOrderedActionName(h), this.durativeActionCounter);
                // ? start action-name argument1 argument2 @ 0
                newValStepText.push(`start ${h.getFullActionName()} @ ${h.getTime()}`);
                break;

            case HappeningType.END:
                const index = this.durativeActionIndex.get(this.toOrderedActionName(h));
                // ? end 3 @ 4.001
                newValStepText.push(`end ${index} @ ${h.getTime()}`);
                break;

            default:
                newValStepText.push('; error exporting: ' + h.toString());
                break;
        }

        // update the plan makespan 
        this.makespan = h.getTime();

        return newValStepText;
    }

    toOrderedActionName(h: Happening): string {
        return h.getFullActionName() + '#' + h.getCounter();
    }
}