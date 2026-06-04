/**
 * Shared repository path matching for issue → building mapping.
 */

import { normalizeRepoPath } from "./buildingIndex.js";

const PATH_IN_TEXT_RE = /((?:[\w.@~-]+\/)+[\w.@~-]+\.\w{1,8})/g;

export function buildCityPathSet(explorerFiles = []) {
    const pathSet = new Set();
    const pathByBuildingId = new Map();

    for (const file of explorerFiles || []) {
        if (!file?.buildingId || !file?.path) continue;
        const path = normalizeRepoPath(file.path);
        pathSet.add(path);
        pathByBuildingId.set(file.buildingId, path);
    }

    return { pathSet, pathByBuildingId };
}

export function resolvePathInSet(rawPath, pathSet) {
    const normalized = normalizeRepoPath(rawPath);
    if (!normalized) return null;
    if (pathSet.has(normalized)) return normalized;
    const lower = normalized.toLowerCase();
    for (const known of pathSet) {
        if (known.toLowerCase() === lower) return known;
    }
    return null;
}

export function pathMentionedInText(path, text, pathSet) {
    if (!text || !path) return false;
    const normalized = resolvePathInSet(path, pathSet);
    if (!normalized) return false;
    const lower = text.toLowerCase();
    if (lower.includes(normalized.toLowerCase())) return true;

    const base = normalized.split("/").pop()?.toLowerCase();
    if (!base || base.length < 3) return false;

    const sameName = [...pathSet].filter(
        (p) => p.split("/").pop()?.toLowerCase() === base,
    );
    return sameName.length === 1 && sameName[0] === normalized;
}

export function extractPathsFromText(text, pathSet) {
    const matched = new Set();
    if (!text || !pathSet?.size) return matched;

    for (const path of pathSet) {
        if (pathMentionedInText(path, text, pathSet)) matched.add(path);
    }

    for (const match of text.matchAll(PATH_IN_TEXT_RE)) {
        const resolved = resolvePathInSet(match[1], pathSet);
        if (resolved) matched.add(resolved);
    }

    return matched;
}

export function findExplorerFileByPath(explorerFiles, filePath) {
    const normalized = normalizeRepoPath(filePath);
    if (!normalized) return null;
    return (
        explorerFiles?.find(
            (f) => normalizeRepoPath(f.path) === normalized && f.buildingId,
        ) || null
    );
}
