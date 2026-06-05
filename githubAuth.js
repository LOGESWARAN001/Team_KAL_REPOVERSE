/**
 * GitHub API token — from .env (dev) or sessionStorage (browser).
 */

const STORAGE_KEY = "github_city_token";
const USER_STORAGE_KEY = "github_city_user";

export function getGithubToken() {
    const fromEnv = import.meta.env.VITE_GITHUB_TOKEN;
    if (fromEnv && String(fromEnv).trim()) {
        return String(fromEnv).trim();
    }
    try {
        return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch {
        return "";
    }
}

export function setGithubToken(token) {
    try {
        const trimmed = (token || "").trim();
        if (trimmed) {
            sessionStorage.setItem(STORAGE_KEY, trimmed);
        } else {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        /* private browsing */
    }
}

export function hasGithubToken() {
    return Boolean(getGithubToken());
}

export function storeGitHubUser(user) {
    try {
        if (user) {
            sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        } else {
            sessionStorage.removeItem(USER_STORAGE_KEY);
        }
    } catch {
        /* private browsing */
    }
}

export function getStoredGitHubUser() {
    try {
        const raw = sessionStorage.getItem(USER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearGithubSession() {
    setGithubToken("");
    storeGitHubUser(null);
}
