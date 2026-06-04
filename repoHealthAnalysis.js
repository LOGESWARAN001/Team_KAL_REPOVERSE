/**
 * Repository health signals → building issue metadata (enrichment layer).
 */

import { githubFetch } from "./api.js";
import { normalizeRepoPath } from "./buildingIndex.js";
import {
    logBuildingMapped,
    logHealthScanSummary,
    logIssueDetected,
    logIssueFileAudit,
    logIssueVisualization,
    logScanPipeline,
    logSeverityAssigned,
} from "./cityDiagnostics.js";
import {
    buildCityPathSet,
    extractPathsFromText,
    resolvePathInSet,
} from "./issuePathMapping.js";
import { getFileTypeFromPath } from "./localFileAnalysis.js";
import { scanRepositorySyntax } from "./repoIssueScan.js";

const MAX_ISSUES = 40;

const SEVERITY_RANK = { minor: 1, medium: 2, high: 3, critical: 4 };

function rankSeverity(label) {
    return SEVERITY_RANK[String(label || "").toLowerCase()] || 0;
}

function maxSeverity(a, b) {
    return rankSeverity(a) >= rankSeverity(b) ? a : b;
}

function severityFromIssueLabels(labels = []) {
    const names = labels.map((l) => (l.name || "").toLowerCase());
    if (
        names.some((n) =>
            /critical|blocker|p0|security|vulnerability/.test(n),
        )
    ) {
        return "critical";
    }
    if (names.some((n) => /bug|error|defect|p1|high/.test(n))) {
        return "high";
    }
    if (names.some((n) => /warning|debt|tech-debt|medium/.test(n))) {
        return "medium";
    }
    return "minor";
}

function runFileHeuristics(file) {
    const issues = [];
    const path = file.path || "";
    const name = file.name || "";
    const lines = file.lines ?? 0;

    if (/\.(test|spec)\.(js|ts|jsx|tsx|py)$/i.test(name)) {
        return issues;
    }

    if (lines >= 800) {
        issues.push({
            type: "complexity",
            severity: lines >= 1500 ? "high" : "medium",
            title: "Very large file — high complexity risk",
        });
    }

    if (/\.(ya?ml)$/i.test(name) && /\.github\/workflows\//i.test(path)) {
        issues.push({
            type: "ci_config",
            severity: "medium",
            title: "CI workflow — verify pipeline health",
        });
    }

    if (
        /danger|deprecated|legacy|hack|fixme|todo|error|exception|fail/i.test(
            path,
        ) ||
        /temp|backup|copy|old|error|fail/i.test(name)
    ) {
        issues.push({
            type: "tech_debt",
            severity: "medium",
            title: "Naming suggests technical debt or temporary code",
        });
    }

    if (/\.(log|err)$/i.test(name) || /^error/i.test(name)) {
        issues.push({
            type: "bug",
            severity: "high",
            title: "Error log or failure artifact detected in repository",
        });
    }

    if (/config|settings|env/i.test(name) && /\.(json|ya?ml|toml)$/i.test(name)) {
        issues.push({
            type: "security",
            severity: "high",
            title: "Configuration file — review for misconfiguration",
        });
    }

    return issues;
}

function severityFromCodeScanning(ruleSeverity) {
    const level = String(ruleSeverity || "").toLowerCase();
    if (level === "error" || level === "critical") return "critical";
    if (level === "warning" || level === "high") return "high";
    if (level === "note" || level === "medium") return "medium";
    return "minor";
}

async function fetchCodeScanningIssues(owner, repo, pathSet) {
    const issuesByPath = new Map();
    try {
        const alerts = await githubFetch(
            `/repos/${owner}/${repo}/code-scanning/alerts?state=open&per_page=100`,
        );
        for (const alert of alerts || []) {
            const path = resolvePathInSet(
                alert.most_recent_instance?.location?.path,
                pathSet,
            );
            if (!path) continue;
            const list = issuesByPath.get(path) || [];
            list.push({
                type: /security/i.test(alert.rule?.description || "")
                    ? "security"
                    : "bug",
                severity: severityFromCodeScanning(
                    alert.rule?.severity ||
                        alert.rule?.security_severity_level,
                ),
                title:
                    alert.rule?.description ||
                    alert.rule?.name ||
                    "Code scanning alert",
                url: alert.html_url,
            });
            issuesByPath.set(path, list);
        }
        logScanPipeline("Code scanning alerts", {
            fetched: (alerts || []).length,
            mappedPaths: issuesByPath.size,
        });
    } catch (err) {
        logScanPipeline("Code scanning unavailable", {
            status: err?.status,
            message: err?.message,
        });
    }
    return issuesByPath;
}

function mergeIssuesMaps(target, source) {
    for (const [path, list] of source.entries()) {
        target.set(path, [...(target.get(path) || []), ...list]);
    }
}

export async function fetchRepoHealthData(
    owner,
    repo,
    explorerFiles = [],
    defaultBranch = "main",
) {
    const { pathSet } = buildCityPathSet(explorerFiles);

    let openIssues = [];
    try {
        const data = await githubFetch(
            `/repos/${owner}/${repo}/issues?state=open&per_page=${MAX_ISSUES}`,
        );
        openIssues = (data || []).filter((item) => !item.pull_request);
        logScanPipeline("GitHub issues fetched", { count: openIssues.length });
    } catch (err) {
        logScanPipeline("GitHub issues unavailable", {
            status: err?.status,
            message: err?.message,
        });
    }

    const issuesByPath = new Map();

    for (const ghIssue of openIssues) {
        const text = `${ghIssue.title || ""}\n${ghIssue.body || ""}`;
        const severity = severityFromIssueLabels(ghIssue.labels || []);
        for (const path of extractPathsFromText(text, pathSet)) {
            const list = issuesByPath.get(path) || [];
            list.push({
                type: ghIssue.labels?.some((l) =>
                    /security/i.test(l.name),
                )
                    ? "security"
                    : "bug",
                severity,
                title: ghIssue.title || "Open GitHub issue",
                url: ghIssue.html_url,
            });
            issuesByPath.set(path, list);
        }
    }

    const scanningIssues = await fetchCodeScanningIssues(
        owner,
        repo,
        pathSet,
    );
    mergeIssuesMaps(issuesByPath, scanningIssues);

    const syntaxIssues = await scanRepositorySyntax(
        owner,
        repo,
        defaultBranch,
        explorerFiles,
    );
    mergeIssuesMaps(issuesByPath, syntaxIssues);

    const heuristicsByPath = new Map();
    for (const file of explorerFiles) {
        if (!file.buildingId || !file.path) continue;
        const h = runFileHeuristics(file);
        if (h.length) heuristicsByPath.set(normalizeRepoPath(file.path), h);
    }

    return {
        issuesByPath,
        heuristicsByPath,
        openIssueCount: openIssues.length,
        syntaxPathsScanned: syntaxIssues.size,
    };
}

function enrichWithHealth(meta, healthPayload) {
    return {
        ...meta,
        ...healthPayload,
    };
}

function buildHealthPayload(path, ghIssues, heuristicIssues) {
    const combined = [...(ghIssues || []), ...(heuristicIssues || [])];
    if (combined.length === 0) return null;

    let severityLabel = "minor";
    for (const issue of combined) {
        severityLabel = maxSeverity(severityLabel, issue.severity || "minor");
    }

    const primaryIssue = combined[0];
    const issueCount = combined.length;
    const healthScore = Math.max(0, 100 - issueCount * 12 - rankSeverity(severityLabel) * 10);

    logIssueDetected({
        filePath: path,
        issueCount,
        severityLabel,
        sources: {
            githubIssues: ghIssues?.length || 0,
            heuristics: heuristicIssues?.length || 0,
            syntax: combined.filter((i) => i.type === "syntax").length,
        },
        primaryTitle: primaryIssue?.title,
    });

    logSeverityAssigned({
        filePath: path,
        severity: severityLabel,
        issueCount,
        healthScore,
    });

    return {
        hasBug: true,
        issues: combined,
        primaryIssue,
        issueCount,
        healthScore,
        severityLabel,
    };
}

/** 3D fire is reserved for content syntax/parse errors only. */
export function metaHasSyntaxIssue(meta) {
    if (!meta) return false;
    if (meta.primaryIssue?.type === "syntax") return true;
    return (meta.issues || []).some((issue) => issue.type === "syntax");
}

export function shouldSpawnFireForMeta(meta) {
    if (!meta || meta.repaired) return false;
    return metaHasSyntaxIssue(meta);
}

export function shouldSpawnBugIndicatorForMeta(meta) {
    if (!meta || meta.repaired || !meta.hasBug) return false;
    return !shouldSpawnFireForMeta(meta);
}

export function auditBuildingIssueStates(
    explorerFiles = [],
    fileMetaGrid = [],
) {
    const seen = new Set();
    const audit = (meta) => {
        if (!meta?.buildingId || seen.has(meta.buildingId)) return;
        seen.add(meta.buildingId);
        const path = normalizeRepoPath(meta.filePath || meta.path);
        const issueCount =
            meta.issueCount ||
            (meta.hasBug ? meta.issues?.length || 1 : 0) ||
            (meta.buildFailed ? 1 : 0);
        if (issueCount === 0 && !meta.hasBug && !meta.buildFailed) return;

        logIssueFileAudit({
            filePath: path,
            fileType: getFileTypeFromPath(path),
            issueCount,
            severity:
                meta.severityLabel ||
                meta.fireSeverity ||
                (meta.buildFailed ? "critical" : "none"),
            buildingId: meta.buildingId,
            fireActive: shouldSpawnFireForMeta(meta),
            bugIndicator: shouldSpawnBugIndicatorForMeta(meta),
        });
    };

    for (const row of fileMetaGrid || []) {
        for (const cell of row || []) audit(cell);
    }
    for (const file of explorerFiles || []) {
        if (file?.buildingId) audit(file);
    }
}

export function applyHealthToCity(fileMetaGrid, explorerFiles, healthContext) {
    if (!healthContext) {
        return { fileMetaGrid, explorerFiles, healthBuildingIds: [] };
    }

    const healthBuildingIds = [];
    let filesWithIssues = 0;

    const applyToMeta = (meta) => {
        if (!meta?.buildingId) return meta;
        const path = normalizeRepoPath(meta.filePath || meta.path);
        const ghIssues = healthContext.issuesByPath.get(path) || [];
        const heuristicIssues =
            healthContext.heuristicsByPath.get(path) || [];
        const payload = buildHealthPayload(path, ghIssues, heuristicIssues);
        if (!payload) {
            if (meta.hasBug || meta.buildFailed) {
                logIssueFileAudit({
                    filePath: path,
                    fileType: getFileTypeFromPath(path),
                    issueCount:
                        meta.issueCount ||
                        (meta.buildFailed ? 1 : 0) ||
                        (meta.hasBug ? 1 : 0),
                    severity:
                        meta.severityLabel ||
                        meta.fireSeverity ||
                        (meta.buildFailed ? "critical" : "none"),
                    buildingId: meta.buildingId,
                    fireActive: shouldSpawnFireForMeta(meta),
                    bugIndicator: shouldSpawnBugIndicatorForMeta(meta),
                    reason: "CI/enrichment only",
                });
            }
            return meta;
        }

        filesWithIssues += 1;
        healthBuildingIds.push(meta.buildingId);
        logBuildingMapped({
            buildingId: meta.buildingId,
            fileName: meta.fileName,
            filePath: path,
            issueCount: payload.issueCount,
            severity: payload.severityLabel,
            fireEligible: shouldSpawnFireForMeta({
                ...meta,
                ...payload,
            }),
        });

        const enriched = enrichWithHealth(meta, payload);
        const fireTrigger = shouldSpawnFireForMeta(enriched);
        const bugIndicator = shouldSpawnBugIndicatorForMeta(enriched);
        logIssueVisualization({
            filePath: path,
            issuesFound: payload.issueCount,
            severity: payload.severityLabel,
            mappedBuilding: meta.buildingId,
            fireTrigger,
            bugIndicator,
            healthScore: payload.healthScore,
        });
        return enriched;
    };

    const newGrid = (fileMetaGrid || []).map((row) =>
        row.map((cell) => (cell ? applyToMeta(cell) : cell)),
    );

    const newExplorer = explorerFiles.map((file) =>
        file?.buildingId ? applyToMeta(file) : file,
    );

    logHealthScanSummary({
        openIssuesFetched: healthContext.openIssueCount,
        syntaxFilesWithIssues: healthContext.syntaxPathsScanned ?? 0,
        filesWithIssues,
        healthBuildingIds: healthBuildingIds.length,
        fireEligible: newExplorer.filter(shouldSpawnFireForMeta).length,
    });

    auditBuildingIssueStates(newExplorer, newGrid);

    return {
        fileMetaGrid: newGrid,
        explorerFiles: newExplorer,
        healthBuildingIds,
    };
}
