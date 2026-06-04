/**
 * Fetches repository file contents and runs local syntax analysis.
 */

import { githubFetch } from "./api.js";
import { normalizeRepoPath } from "./buildingIndex.js";
import { logScanPipeline, logSyntaxScanAudit } from "./cityDiagnostics.js";
import {
    analyzeFileContent,
    isAnalyzableFilePath,
} from "./localFileAnalysis.js";

const MAX_SCAN_FILES = 150;
const MAX_FILE_BYTES = 120_000;
const FETCH_CONCURRENCY = 8;

function decodeGitHubContent(encoded) {
    const binary = atob((encoded || "").replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
}

async function fetchFileContent(owner, repo, filePath, ref) {
    const encodedPath = filePath
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
    const data = await githubFetch(
        `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data || data.type !== "file") return null;
    if ((data.size || 0) > MAX_FILE_BYTES) return null;
    if (data.encoding === "base64" && data.content) {
        return decodeGitHubContent(data.content);
    }
    if (typeof data.content === "string") {
        return data.content;
    }
    return null;
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i], i);
        }
    }

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        () => worker(),
    );
    await Promise.all(workers);
    return results;
}

/**
 * Scan city-visible files for syntax/parse errors using GitHub file contents.
 * @returns {Promise<Map<string, object[]>>}
 */
export async function scanRepositorySyntax(
    owner,
    repo,
    defaultBranch,
    explorerFiles = [],
) {
    const issuesByPath = new Map();
    const candidates = explorerFiles
        .filter(
            (f) =>
                f?.buildingId &&
                f?.path &&
                isAnalyzableFilePath(f.path),
        )
        .slice(0, MAX_SCAN_FILES);

    logScanPipeline("Syntax scan starting", {
        branch: defaultBranch,
        candidateFiles: candidates.length,
    });

    if (candidates.length === 0) {
        return issuesByPath;
    }

    let analyzed = 0;
    let withIssues = 0;
    let fetchFailed = 0;

    await mapWithConcurrency(candidates, FETCH_CONCURRENCY, async (file) => {
        const path = normalizeRepoPath(file.path);
        let content = null;
        try {
            content = await fetchFileContent(
                owner,
                repo,
                path,
                defaultBranch,
            );
        } catch (err) {
            fetchFailed++;
            logScanPipeline("Syntax scan fetch failed", {
                filePath: path,
                status: err?.status,
                message: err?.message,
            });
            return;
        }

        if (content == null) return;
        analyzed++;

        const { fileType, issues } = analyzeFileContent(path, content);
        if (!issues.length) {
            logSyntaxScanAudit({
                filePath: path,
                fileType,
                issuesFound: 0,
                severity: "none",
                buildingId: file.buildingId,
                fireActive: false,
            });
            return;
        }

        withIssues++;
        let severityLabel = "high";
        for (const issue of issues) {
            if (issue.severity === "critical") severityLabel = "critical";
        }

        const mappedIssues = issues.map((issue) => ({
            type: "syntax",
            severity: issue.severity || "high",
            title: issue.title,
            rule: issue.rule,
        }));

        issuesByPath.set(path, mappedIssues);

        logSyntaxScanAudit({
            filePath: path,
            fileType,
            issuesFound: mappedIssues.length,
            severity: severityLabel,
            buildingId: file.buildingId,
            fireActive: true,
        });
    });

    logScanPipeline("Syntax scan complete", {
        analyzed,
        withIssues,
        fetchFailed,
        mappedPaths: issuesByPath.size,
    });

    return issuesByPath;
}
