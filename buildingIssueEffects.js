/**
 * Applies fire / warning effects when building meshes become available.
 */

import { getEnrichedBuildingMeta } from "./buildingIndex.js";
import {
    computeBuildingRoofAnchor,
    expandBuildingBox,
} from "./buildingRegistry.js";
import { logIssueFileAudit } from "./cityDiagnostics.js";
import { getFileTypeFromPath } from "./localFileAnalysis.js";
import { repairFireBuilding, setupFireBuilding } from "./fireBuildings.js";
import { getFireBuilding } from "./fireRegistry.js";
import { trySpawnWarningBeacon } from "./issueIndicators.js";
import {
    shouldSpawnBugIndicatorForMeta,
    shouldSpawnFireForMeta,
} from "./repoHealthAnalysis.js";

const EFFECT_RETRY_MS = 150;
const EFFECT_MAX_ATTEMPTS = 80;

export function applyEffectsForBuildingMeta(meta, attempt = 0) {
    meta = getEnrichedBuildingMeta(meta);
    if (!meta?.buildingId || meta.repaired) {
        return { fireActive: false, bugIndicator: false };
    }

    const path = meta.filePath || meta.path || "";
    const issueCount =
        meta.issueCount ||
        (meta.hasBug ? meta.issues?.length || 1 : 0) ||
        (meta.buildFailed ? 1 : 0);
    const severity =
        meta.severityLabel ||
        meta.fireSeverity ||
        (meta.buildFailed ? "critical" : "none");

    if (!expandBuildingBox(meta.buildingId)) {
        if (attempt < EFFECT_MAX_ATTEMPTS) {
            setTimeout(
                () => applyEffectsForBuildingMeta(meta, attempt + 1),
                EFFECT_RETRY_MS,
            );
        }
        return { fireActive: false, bugIndicator: false, pending: true };
    }

    let fireActive = false;
    let bugIndicator = false;

    if (shouldSpawnFireForMeta(meta)) {
        const existing = getFireBuilding(meta.buildingId);
        const anchor = computeBuildingRoofAnchor(meta.buildingId);
        if (
            existing?.bounds?.roofY != null &&
            anchor?.roofY != null &&
            anchor.roofY > existing.bounds.roofY + 0.35
        ) {
            repairFireBuilding(meta.buildingId);
        }
        if (!getFireBuilding(meta.buildingId)) {
            fireActive = anchor ? !!setupFireBuilding(meta) : false;
        } else {
            fireActive = true;
        }
    } else if (getFireBuilding(meta.buildingId)) {
        repairFireBuilding(meta.buildingId);
    }

    if (!fireActive && shouldSpawnBugIndicatorForMeta(meta)) {
        bugIndicator = trySpawnWarningBeacon(meta);
    }

    const needsRetry =
        !fireActive &&
        !bugIndicator &&
        (shouldSpawnFireForMeta(meta) || shouldSpawnBugIndicatorForMeta(meta));

    if (needsRetry && attempt < EFFECT_MAX_ATTEMPTS) {
        setTimeout(
            () => applyEffectsForBuildingMeta(meta, attempt + 1),
            EFFECT_RETRY_MS,
        );
        return { fireActive: false, bugIndicator: false, pending: true };
    }

    if (issueCount > 0 || meta.hasBug || meta.buildFailed) {
        logIssueFileAudit({
            filePath: path,
            fileType: getFileTypeFromPath(path),
            issueCount,
            severity,
            buildingId: meta.buildingId,
            fireActive,
            bugIndicator,
        });
    }

    return { fireActive, bugIndicator };
}

/** Force fire/beacon spawn for a building (e.g. when user selects an issue file). */
export function ensureBuildingIssueEffects(meta) {
    if (!meta?.buildingId) return;
    applyEffectsForBuildingMeta(getEnrichedBuildingMeta(meta));
}

/** Re-apply fire/beacon effects after fire group init or late mesh loads. */
export function reconcileBuildingIssueEffects(
    fileMetaGrid = [],
    explorerFiles = [],
) {
    const seen = new Set();
    const consider = (raw) => {
        const meta = getEnrichedBuildingMeta(raw);
        if (!meta?.buildingId || seen.has(meta.buildingId)) return;
        seen.add(meta.buildingId);
        applyEffectsForBuildingMeta(meta);
    };

    for (const row of fileMetaGrid) {
        for (const cell of row || []) consider(cell);
    }
    for (const file of explorerFiles) consider(file);
}
