/**
 * Fetch repository file contents via GitHub Contents API.
 */

import { githubFetch } from "./api.js";

const MAX_FILE_BYTES = 120_000;

function decodeGitHubContent(encoded) {
    const binary = atob((encoded || "").replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} ref
 * @returns {Promise<{ content: string, sha: string, size: number } | null>}
 */
export async function fetchRepoFileContent(owner, repo, filePath, ref) {
    if (!filePath || filePath === "—") return null;

    const encodedPath = filePath
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");

    try {
        const data = await githubFetch(
            `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
        );
        if (!data || data.type !== "file") return null;
        if ((data.size || 0) > MAX_FILE_BYTES) return null;

        let content = "";
        if (data.encoding === "base64" && data.content) {
            content = decodeGitHubContent(data.content);
        } else if (typeof data.content === "string") {
            content = data.content;
        }

        return {
            content,
            sha: data.sha,
            size: data.size || content.length,
        };
    } catch {
        return null;
    }
}
