/**
 * GitHub repository API and grid conversion.
 */

import { getGithubToken, hasGithubToken } from "./githubAuth.js";
import { buildRepositoryGrid } from "./repoGrid.js";

const GITHUB_API = import.meta.env.DEV
    ? "/github-api"
    : "https://api.github.com";
const CACHE_TTL_MS = 10 * 60 * 1000;
const repoCache = new Map();

export function parseRepositoryUrl(input) {
    const trimmed = input.trim();
    let owner;
    let repo;

    try {
        if (trimmed.includes("github.com")) {
            const url = new URL(
                trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
            );
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length < 2) return null;
            owner = parts[0];
            repo = parts[1].replace(/\.git$/, "");
        } else if (trimmed.includes("/")) {
            [owner, repo] = trimmed.split("/").filter(Boolean);
            repo = repo.replace(/\.git$/, "");
        } else {
            return null;
        }
    } catch {
        return null;
    }

    if (!owner || !repo) return null;
    return { owner, repo, fullName: `${owner}/${repo}` };
}

function getGithubHeaders() {
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GitHubCity/1.0",
    };
    const token = getGithubToken();
    if (token) {
        if (import.meta.env.DEV) {
            // Dev server proxy reads this and attaches Authorization server-side.
            headers["X-GitHub-Token"] = token;
        } else {
            headers.Authorization = `Bearer ${token}`;
        }
    }
    return headers;
}

export async function githubFetch(path) {
    const response = await fetch(`${GITHUB_API}${path}`, {
        headers: getGithubHeaders(),
    });

    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok) {
        const error = new Error(
            body?.message || `GitHub API error: ${response.status}`,
        );
        error.status = response.status;
        error.documentationUrl = body?.documentation_url;
        throw error;
    }

    return body;
}

function getCachedRepo(cacheKey) {
    const entry = repoCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.time > CACHE_TTL_MS) {
        repoCache.delete(cacheKey);
        return null;
    }
    return entry.data;
}

function setCachedRepo(cacheKey, data) {
    repoCache.set(cacheKey, { time: Date.now(), data });
}

export function clearRepoCache() {
    repoCache.clear();
}

export async function fetchRepository(repoInput) {
    const parsed = parseRepositoryUrl(repoInput);
    if (!parsed) {
        return { error: "invalid_url" };
    }

    const cacheKey = parsed.fullName.toLowerCase();
    const cached = getCachedRepo(cacheKey);
    if (cached) return cached;

    try {
        const repoData = await githubFetch(
            `/repos/${parsed.owner}/${parsed.repo}`,
        );
        const branch = repoData.default_branch || "main";
        const treeData = await githubFetch(
            `/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
        );

        let result;
        if (treeData.truncated) {
            const shallowTree = await githubFetch(
                `/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}`,
            );
            const files = await collectTreeFiles(
                parsed.owner,
                parsed.repo,
                shallowTree.tree,
            );
            result = buildRepoResult(parsed, repoData, files);
        } else {
            result = buildRepoResult(parsed, repoData, treeData.tree || []);
        }

        setCachedRepo(cacheKey, result);
        return result;
    } catch (err) {
        if (err.status === 404) {
            return { error: "not_found", fullName: parsed.fullName };
        }
        if (err.status === 403) {
            const isRateLimit = /rate limit/i.test(err.message || "");
            return {
                error: isRateLimit ? "rate_limit" : "forbidden",
                message: err.message,
                fullName: parsed.fullName,
            };
        }
        return {
            error: "network",
            message: err.message,
            fullName: parsed.fullName,
        };
    }
}

async function collectTreeFiles(owner, repo, entries, parentPath = "") {
    const files = [];
    for (const entry of entries) {
        const path = parentPath ? `${parentPath}/${entry.path}` : entry.path;
        if (entry.type === "blob") {
            files.push({ ...entry, path });
        } else if (entry.type === "tree") {
            const treeData = await githubFetch(
                `/repos/${owner}/${repo}/git/trees/${entry.sha}`,
            );
            const nested = await collectTreeFiles(
                owner,
                repo,
                treeData.tree || [],
                path,
            );
            files.push(...nested);
        }
    }
    return files;
}

function buildRepoResult(parsed, repoData, tree) {
    const { grid, heightGrid, fileMetaGrid, explorerFiles, stats } =
        buildRepositoryGrid(tree);
    stats.owner = parsed.owner;
    stats.repo = parsed.repo;
    stats.description = repoData.description;
    return {
        grid,
        heightGrid,
        fileMetaGrid,
        explorerFiles,
        stats,
        fullName: parsed.fullName,
        defaultBranch: repoData.default_branch || "main",
    };
}

export function getRepositoryCityData(repoResult) {
    return {
        contribs: repoResult.grid,
        heightGrid: repoResult.heightGrid,
        fileMetaGrid: repoResult.fileMetaGrid,
        explorerFiles: repoResult.explorerFiles,
        stats: repoResult.stats,
    };
}

export function getFetchErrorMessage(result) {
    switch (result?.error) {
        case "invalid_url":
            return "That does not look like a valid GitHub repository URL. Use owner/repo or a full github.com link.";
        case "not_found":
            return `Repository "${result.fullName || "unknown"}" was not found. Check that it is public and spelled correctly.`;
        case "rate_limit":
            return import.meta.env.DEV
                ? "GitHub API rate limit reached. Restart the dev server (npm run dev) so your .env token loads, or paste a token in the field below."
                : hasGithubToken()
                  ? "GitHub API rate limit reached even with your token. Wait a few minutes and try again."
                  : "GitHub API rate limit reached. Add a personal access token below, or create a .env file with VITE_GITHUB_TOKEN, then try again.";
        case "forbidden":
            return "GitHub denied access to this repository. It may be private — add a VITE_GITHUB_TOKEN with repo scope.";
        case "network":
            return result.message
                ? `Could not reach GitHub: ${result.message}`
                : "Could not reach GitHub. Check your connection and try again.";
        default:
            return "Could not load that repository. Check the URL and try again.";
    }
}
