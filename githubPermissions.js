/**
 * GitHub authentication helpers and repository permission checks.
 */

import { githubFetch } from "./api.js";
import {
    getStoredGitHubUser,
    hasGithubToken,
    setGithubToken,
    storeGitHubUser,
} from "./githubAuth.js";

/**
 * Validate token and fetch authenticated user profile.
 * @returns {Promise<{ login: string, name: string, avatar_url: string } | null>}
 */
export async function loginWithGitHubToken(token) {
    const trimmed = (token || "").trim();
    if (!trimmed) return null;

    setGithubToken(trimmed);

    try {
        const user = await githubFetch("/user");
        storeGitHubUser(user);
        return user;
    } catch {
        setGithubToken("");
        return null;
    }
}

/**
 * @returns {Promise<{ login: string, name: string, avatar_url: string } | null>}
 */
export async function refreshGitHubUser() {
    if (!hasGithubToken()) return null;
    try {
        const user = await githubFetch("/user");
        storeGitHubUser(user);
        return user;
    } catch {
        return getStoredGitHubUser();
    }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<{
 *   hasWriteAccess: boolean,
 *   canFork: boolean,
 *   isOwner: boolean,
 *   permissions: { admin: boolean, push: boolean, pull: boolean },
 *   forked: boolean,
 *   defaultBranch: string,
 *   fullName: string
 * }>}
 */
export async function checkRepoPermissions(owner, repo) {
    const user = await refreshGitHubUser();
    const repoData = await githubFetch(`/repos/${owner}/${repo}`);

    const permissions = repoData.permissions || {
        admin: false,
        push: false,
        pull: true,
    };

    const isOwner = Boolean(
        user?.login && repoData.owner?.login?.toLowerCase() === user.login.toLowerCase(),
    );

    const hasWriteAccess = Boolean(permissions.push || permissions.admin || isOwner);

    return {
        hasWriteAccess,
        canFork: Boolean(repoData.allow_forking !== false && !repoData.archived),
        isOwner,
        permissions,
        forked: Boolean(repoData.fork),
        defaultBranch: repoData.default_branch || "main",
        fullName: repoData.full_name || `${owner}/${repo}`,
    };
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<{ forkOwner: string, forkRepo: string, forkFullName: string } | null>}
 */
export async function forkRepository(owner, repo) {
    const fork = await githubFetch(`/repos/${owner}/${repo}/forks`, {
        method: "POST",
    });
    if (!fork?.full_name) return null;
    const [forkOwner, forkRepo] = fork.full_name.split("/");
    return {
        forkOwner,
        forkRepo,
        forkFullName: fork.full_name,
    };
}
