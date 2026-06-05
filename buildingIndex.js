/**
 * Canonical filePath ↔ buildingId index for explorer and 3D selection.
 */

import { expandBuildingBox, getBuilding } from "./buildingRegistry.js";
import { logSelection } from "./cityDiagnostics.js";

const pathToBuildingId = new Map();
const buildingIdToPath = new Map();
const buildingIdToMeta = new Map();
const pathToBuildingIdLower = new Map();

export function normalizeRepoPath(filePath) {
    return String(filePath || "")
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^\/+/, "")
        .replace(/\/+/g, "/")
        .trim();
}

export function clearBuildingIndex() {
    pathToBuildingId.clear();
    pathToBuildingIdLower.clear();
    buildingIdToPath.clear();
    buildingIdToMeta.clear();
}

function registerPathMapping(path, buildingId, meta) {
    const existing = pathToBuildingId.get(path);
    if (existing && existing !== buildingId) {
        return false;
    }
    pathToBuildingId.set(path, buildingId);
    pathToBuildingIdLower.set(path.toLowerCase(), buildingId);
    buildingIdToPath.set(buildingId, path);
    if (meta) buildingIdToMeta.set(buildingId, meta);
    return true;
}

export function buildBuildingIndex(explorerFiles = [], fileMetaGrid = []) {
    clearBuildingIndex();

    for (const row of fileMetaGrid || []) {
        for (const cell of row || []) {
            if (!cell?.buildingId) continue;
            const path = normalizeRepoPath(cell.filePath || cell.path);
            if (!path) continue;
            registerPathMapping(path, cell.buildingId, {
                ...cell,
                filePath: path,
                path,
            });
        }
    }

    for (const file of explorerFiles || []) {
        if (!file?.buildingId || !file?.path) continue;
        const path = normalizeRepoPath(file.path);
        if (!pathToBuildingId.has(path)) {
            registerPathMapping(path, file.buildingId, null);
        }
        buildingIdToMeta.set(file.buildingId, {
            ...buildingIdToMeta.get(file.buildingId),
            ...file,
            filePath: path,
            path,
        });
    }
}

export function resolveBuildingIdByPath(filePath) {
    const normalized = normalizeRepoPath(filePath);
    if (!normalized) return null;
    const exact = pathToBuildingId.get(normalized);
    if (exact) return exact;
    return pathToBuildingIdLower.get(normalized.toLowerCase()) || null;
}

export function resolvePathByBuildingId(buildingId) {
    return buildingIdToPath.get(buildingId) || null;
}

export function getBuildingMetaById(buildingId) {
    return buildingIdToMeta.get(buildingId) || null;
}

const SEVERITY_RANK = { minor: 1, medium: 2, high: 3, critical: 4 };

function rankSeverity(label) {
    return SEVERITY_RANK[String(label || "").toLowerCase()] || 0;
}

function pickHigherSeverity(a, b) {
    return rankSeverity(a) >= rankSeverity(b) ? a : b;
}

/** Clear scan-time issue fields after a hero repair (registry or session). */
export function markBuildingRepairedInIndex(buildingId) {
    const meta = buildingIdToMeta.get(buildingId);
    if (!meta) return;
    buildingIdToMeta.set(buildingId, {
        ...meta,
        repaired: true,
        missionComplete: true,
        hasBug: false,
        buildFailed: false,
        issues: [],
        primaryIssue: null,
        issueCount: 0,
    });
}

function isMetaRepaired(meta) {
    return Boolean(meta?.repaired || meta?.missionComplete);
}

function buildRepairedMeta(meta, indexed) {
    const filePath = normalizeRepoPath(
        indexed?.filePath ||
            indexed?.path ||
            meta.filePath ||
            meta.path,
    );
    return {
        ...indexed,
        ...meta,
        buildingId: meta.buildingId,
        repaired: true,
        missionComplete: true,
        hasBug: false,
        buildFailed: false,
        issues: [],
        primaryIssue: null,
        issueCount: 0,
        filePath,
        path: filePath,
    };
}

/** Merge indexed issue/health fields onto mesh registration metadata. */
export function getEnrichedBuildingMeta(meta) {
    if (!meta?.buildingId) return meta;
    const indexed = getBuildingMetaById(meta.buildingId);
    if (!indexed) return meta;

    if (isMetaRepaired(meta)) {
        return buildRepairedMeta(meta, indexed);
    }

    const issues =
        (indexed.issues?.length ? indexed.issues : null) ||
        meta.issues ||
        [];
    const primaryIssue =
        indexed.primaryIssue || meta.primaryIssue || issues[0] || null;
    const severityLabel = pickHigherSeverity(
        meta.severityLabel,
        indexed.severityLabel,
    );

    return {
        ...meta,
        ...indexed,
        buildingId: meta.buildingId,
        hasBug: Boolean(meta.hasBug || indexed.hasBug || issues.length > 0),
        buildFailed: Boolean(meta.buildFailed || indexed.buildFailed),
        issueCount: Math.max(meta.issueCount || 0, indexed.issueCount || 0, issues.length),
        issues,
        primaryIssue,
        severityLabel: severityLabel || indexed.severityLabel || meta.severityLabel,
        filePath: normalizeRepoPath(
            indexed.filePath || indexed.path || meta.filePath || meta.path,
        ),
        path: normalizeRepoPath(
            indexed.path || indexed.filePath || meta.path || meta.filePath,
        ),
    };
}

/** Keep registry metadata aligned with explorer/grid enrichment after meshes load. */
export function syncRegistryMetaFromIndex() {
    for (const [buildingId, indexed] of buildingIdToMeta) {
        const entry = getBuilding(buildingId);
        if (!entry) continue;
        entry.meta = getEnrichedBuildingMeta({
            ...entry.meta,
            ...indexed,
            buildingId,
        });
    }
}

export function resolveFileByPath(explorerFiles, filePath) {
    const normalized = normalizeRepoPath(filePath);
    return (
        explorerFiles?.find((f) => normalizeRepoPath(f.path) === normalized) ||
        null
    );
}

export function resolveFileForBuilding(
    explorerFiles,
    buildingId,
    preferredPath = null,
) {
    if (!buildingId) return null;
    const path =
        normalizeRepoPath(preferredPath) ||
        resolvePathByBuildingId(buildingId);
    if (!path) return null;
    return resolveFileByPath(explorerFiles, path);
}

export function validateSelection(explorerFiles, filePath, buildingIdUsed) {
    const normalizedPath = normalizeRepoPath(filePath);
    const expectedId = resolveBuildingIdByPath(normalizedPath);
    const file = resolveFileByPath(explorerFiles, normalizedPath);
    const registryEntry = buildingIdUsed ? getBuilding(buildingIdUsed) : null;
    const bounds = buildingIdUsed ? expandBuildingBox(buildingIdUsed) : null;

    let status = "FAIL";
    let failureReason = "Building not found for file path";

    if (!normalizedPath) {
        failureReason = "Empty file path";
    } else if (!buildingIdUsed) {
        failureReason =
            "No building mapped to this file (may be truncated from city grid)";
    } else if (expectedId && expectedId !== buildingIdUsed) {
        failureReason = `Building ID mismatch (expected ${expectedId})`;
    } else if (
        !expectedId &&
        file?.buildingId &&
        file.buildingId !== buildingIdUsed
    ) {
        failureReason = "Explorer file buildingId does not match selection";
    } else if (!expectedId && !file?.buildingId) {
        failureReason =
            "File path is not indexed (buildingId may still be valid)";
        status = buildingIdUsed ? "SUCCESS" : "FAIL";
    } else {
        status = "SUCCESS";
        failureReason = null;
    }

    if (status === "SUCCESS" && !registryEntry) {
        failureReason = "Building mesh not registered yet (may still be loading)";
    }

    logSelection({
        selectedFile: normalizedPath || filePath,
        resolvedBuilding: buildingIdUsed,
        expectedBuilding: expectedId || file?.buildingId || null,
        buildingPosition: bounds?.center
            ? {
                  x: Math.round(bounds.center.x * 100) / 100,
                  y: Math.round(bounds.center.y * 100) / 100,
                  z: Math.round(bounds.center.z * 100) / 100,
              }
            : null,
        selectionStatus: status,
        failureReason: status === "FAIL" ? failureReason : undefined,
    });

    return { status, expectedId, file, failureReason };
}

export function getIndexedBuildingCount() {
    return pathToBuildingId.size;
}
