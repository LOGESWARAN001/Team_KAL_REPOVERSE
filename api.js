/**
 * GitHub repository API and grid conversion.
 */

import { buildRepositoryGrid } from "./repoGrid.js";

const GITHUB_API = "https://api.github.com";

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

async function githubFetch(path) {
    const response = await fetch(`${GITHUB_API}${path}`, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
        const error = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

export async function fetchRepository(repoInput) {
    const parsed = parseRepositoryUrl(repoInput);
    if (!parsed) return null;

    try {
        const repoData = await githubFetch(
            `/repos/${parsed.owner}/${parsed.repo}`,
        );
        const branch = repoData.default_branch || "main";
        const treeData = await githubFetch(
            `/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
        );

        if (treeData.truncated) {
            const shallowTree = await githubFetch(
                `/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}`,
            );
            const files = await collectTreeFiles(
                parsed.owner,
                parsed.repo,
                shallowTree.tree,
            );
            return buildRepoResult(parsed, repoData, files);
        }

        return buildRepoResult(parsed, repoData, treeData.tree || []);
    } catch {
        return null;
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
