/**
 * Fetches repository file contents and runs local syntax analysis.
 */

import {
    clearBranchFix,
    getBranchFixForPath,
} from "./branchFixRegistry.js";
import { normalizeRepoPath } from "./buildingIndex.js";
import { logScanPipeline, logSyntaxScanAudit } from "./cityDiagnostics.js";
import {
    analyzeFileContent,
    isAnalyzableFilePath,
} from "./localFileAnalysis.js";
import { fetchRepoFileContent } from "./repoFileContent.js";

const MAX_SCAN_FILES = 150;
const FETCH_CONCURRENCY = 8;

async function fetchFileContent(owner, repo, filePath, ref) {
    const data = await fetchRepoFileContent(owner, repo, filePath, ref);
    return data?.content ?? null;
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

        let { fileType, issues } = analyzeFileContent(path, content);

        if (issues.length > 0) {
            const fixBranch = getBranchFixForPath(path);
            if (fixBranch && fixBranch !== defaultBranch) {
                try {
                    const branchContent = await fetchFileContent(
                        owner,
                        repo,
                        path,
                        fixBranch,
                    );
                    if (branchContent != null) {
                        const branchAnalysis = analyzeFileContent(
                            path,
                            branchContent,
                        );
                        if (!branchAnalysis.issues.length) {
                            logSyntaxScanAudit({
                                filePath: path,
                                fileType: branchAnalysis.fileType,
                                issuesFound: 0,
                                severity: "none",
                                buildingId: file.buildingId,
                                fireActive: false,
                                resolvedOnBranch: fixBranch,
                            });
                            return;
                        }
                    }
                } catch {
                    /* fall through to default-branch issues */
                }
            }
        } else {
            clearBranchFix(path);
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
