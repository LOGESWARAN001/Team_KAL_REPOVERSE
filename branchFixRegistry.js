/**
 * Remembers files fixed on feature branches so reload reflects pushed fixes
 * before they are merged into the default branch.
 */

import { normalizeRepoPath } from "./buildingIndex.js";

const STORAGE_KEY = "github_city_branch_fixes";

function loadFixes() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return {};
}

function saveFixes(fixes) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fixes));
    } catch {
        /* ignore */
    }
}

/** Record that a file was fixed on a pushed branch. */
export function recordBranchFix(filePath, branchName) {
    const path = normalizeRepoPath(filePath);
    if (!path || !branchName) return;
    const fixes = loadFixes();
    fixes[path] = {
        branch: branchName,
        at: Date.now(),
    };
    saveFixes(fixes);
}

export function getBranchFixForPath(filePath) {
    const path = normalizeRepoPath(filePath);
    if (!path) return null;
    const entry = loadFixes()[path];
    return entry?.branch || null;
}

export function clearBranchFix(filePath) {
    const path = normalizeRepoPath(filePath);
    if (!path) return;
    const fixes = loadFixes();
    if (!fixes[path]) return;
    delete fixes[path];
    saveFixes(fixes);
}

export function clearBranchFixRegistry() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
