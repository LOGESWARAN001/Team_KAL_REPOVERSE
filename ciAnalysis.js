/**
 * Fetches failed GitHub Actions / CI runs and maps them to city buildings.
 */

import { githubFetch } from "./api.js";

const MAX_RUNS = 20;
const MAX_JOB_FETCH = 8;

const CI_RELATED_PATTERN =
    /package\.json|package-lock\.json|yarn\.lock|pnpm-lock|Dockerfile|docker-compose|Makefile|makefile|Jenkinsfile|\.gitlab-ci|azure-pipelines|\.circleci|tsconfig\.json|vite\.config|webpack\.config/i;

function findFailedStep(jobs) {
    for (const job of jobs) {
        if (job.conclusion !== "failure" && job.conclusion !== "cancelled") {
            continue;
        }
        for (const step of job.steps || []) {
            if (step.conclusion === "failure") {
                return step.name;
            }
        }
        if (job.name) return job.name;
    }
    return null;
}

function normalizeWorkflowPath(path) {
    if (!path) return "";
    return path.replace(/^\.\//, "").replace(/\\/g, "/").toLowerCase();
}

function pathVariants(path) {
    const normalized = normalizeWorkflowPath(path);
    if (!normalized) return [];
    const variants = new Set([normalized]);
    if (normalized.endsWith(".yml")) {
        variants.add(normalized.replace(/\.yml$/, ".yaml"));
    } else if (normalized.endsWith(".yaml")) {
        variants.add(normalized.replace(/\.yaml$/, ".yml"));
    }
    return [...variants];
}

function basename(path) {
    return path.split("/").pop() || path;
}

function basenameStem(path) {
    const name = basename(path);
    return name.replace(/\.(ya?ml)$/i, "").toLowerCase();
}

function slugify(name) {
    return (name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function guessWorkflowPathFromName(name) {
    const slug = slugify(name);
    return slug ? `.github/workflows/${slug}.yml` : "";
}

function hoursAgo(isoDate) {
    if (!isoDate) return Infinity;
    return (Date.now() - new Date(isoDate).getTime()) / 3600000;
}

function formatTimeAgo(isoDate) {
    const h = hoursAgo(isoDate);
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes ago`;
    if (h < 48) return `${Math.round(h)} hours ago`;
    return `${Math.round(h / 24)} days ago`;
}

export function computeFireSeverity(failure, defaultBranch = "main") {
    let score = 0;
    if (failure.branch === defaultBranch) score += 2;
    if (/deploy|release|production|publish|build/i.test(failure.workflowName)) {
        score += 2;
    }
    if (/test|ci|lint|check/i.test(failure.failedStep || "")) score += 1;
    if (hoursAgo(failure.time) < 6) score += 2;
    else if (hoursAgo(failure.time) < 24) score += 1;

    if (score >= 5) return "critical";
    if (score >= 3) return "medium";
    return "minor";
}

export function generateBuildFixSuggestion(failure) {
    const step = (failure?.failedStep || "").toLowerCase();
    const workflow = (failure?.workflowName || "").toLowerCase();

    if (step.includes("test") || workflow.includes("test")) {
        return "Run the test suite locally with the same runtime as CI. Fix failing tests and push a new commit to re-trigger the workflow.";
    }
    if (step.includes("deploy") || workflow.includes("deploy")) {
        return "Check deployment secrets, environment approvals, and branch protection rules. Verify the deploy target is reachable and credentials are valid.";
    }
    if (step.includes("lint") || step.includes("eslint")) {
        return "Run lint locally (npm run lint or equivalent), fix reported issues, and commit the corrections before merging.";
    }
    if (step.includes("build") || workflow.includes("build")) {
        return "Reproduce the build command locally. Resolve compile errors or missing dependencies, then push a fix to the affected branch.";
    }
    return "Open the failed workflow run on GitHub, expand the failed step logs, reproduce that command locally, and address the root error before redeploying.";
}

function pathsMatch(filePath, workflowPath) {
    const fileVariants = pathVariants(filePath);
    const workflowVariants = pathVariants(workflowPath);
    return fileVariants.some((fv) => workflowVariants.includes(fv));
}

function findFileForFailure(failure, explorerFiles, usedBuildingIds) {
    const workflowFiles = explorerFiles.filter((f) =>
        /\.github\/workflows\/.+\.(ya?ml)$/i.test(f.path),
    );
    const ciFiles = explorerFiles.filter((f) =>
        CI_RELATED_PATTERN.test(f.path),
    );

    const tryPick = (file) =>
        file?.buildingId && !usedBuildingIds.has(file.buildingId)
            ? file
            : null;

    for (const file of workflowFiles) {
        if (pathsMatch(file.path, failure.workflowPath)) {
            const pick = tryPick(file);
            if (pick) return pick;
        }
    }

    const failStem = basenameStem(failure.workflowPath);
    if (failStem) {
        for (const file of workflowFiles) {
            if (basenameStem(file.path) === failStem) {
                const pick = tryPick(file);
                if (pick) return pick;
            }
        }
        const nameSlug = slugify(failure.workflowName);
        for (const file of workflowFiles) {
            if (
                file.path.toLowerCase().includes(nameSlug) ||
                basenameStem(file.path).includes(nameSlug)
            ) {
                const pick = tryPick(file);
                if (pick) return pick;
            }
        }
    }

    for (const file of ciFiles) {
        const pick = tryPick(file);
        if (pick) return pick;
    }

    for (const file of explorerFiles) {
        const pick = tryPick(file);
        if (pick) return pick;
    }

    return null;
}

export async function fetchCiFailureData(
    owner,
    repo,
    defaultBranch = "main",
) {
    let data = null;
    let actionsUnavailable = false;

    try {
        data = await githubFetch(
            `/repos/${owner}/${repo}/actions/runs?status=failure&per_page=${MAX_RUNS}`,
        );
    } catch (err) {
        actionsUnavailable = err?.status === 403 || err?.status === 404;
        return {
            failures: [],
            failuresByPath: new Map(),
            hasFailures: false,
            defaultBranch,
            actionsUnavailable,
        };
    }

    const runs = data?.workflow_runs || [];
    if (runs.length === 0) {
        return {
            failures: [],
            failuresByPath: new Map(),
            hasFailures: false,
            defaultBranch,
            actionsUnavailable: false,
        };
    }

    const failures = [];
    for (let i = 0; i < Math.min(runs.length, MAX_JOB_FETCH); i++) {
        const run = runs[i];
        let failedStep = null;
        try {
            const jobsData = await githubFetch(
                `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`,
            );
            failedStep = findFailedStep(jobsData?.jobs || []);
        } catch {
            /* jobs may require actions:read scope */
        }

        failures.push({
            reason: "GitHub Action Failed",
            workflowName: run.name || "CI Workflow",
            workflowPath: normalizeWorkflowPath(
                run.path || guessWorkflowPathFromName(run.name),
            ),
            branch: run.head_branch || defaultBranch,
            time: run.updated_at || run.created_at,
            timeAgo: formatTimeAgo(run.updated_at || run.created_at),
            url: run.html_url,
            failedStep: failedStep || "Workflow step",
            runId: run.id,
        });
    }

    const failuresByPath = new Map();
    for (const failure of failures) {
        const candidatePaths = [
            failure.workflowPath,
            guessWorkflowPathFromName(failure.workflowName),
            ...pathVariants(failure.workflowPath),
        ].filter(Boolean);

        for (const path of candidatePaths) {
            const normalized = normalizeWorkflowPath(path);
            const existing = failuresByPath.get(normalized);
            const enriched = {
                ...failure,
                workflowPath: normalized,
                fireSeverity: computeFireSeverity(failure, defaultBranch),
            };
            if (
                !existing ||
                new Date(failure.time) > new Date(existing.time)
            ) {
                failuresByPath.set(normalized, enriched);
            }
        }
    }

    return {
        failures,
        failuresByPath,
        hasFailures: failures.length > 0,
        defaultBranch,
        actionsUnavailable: false,
    };
}

function enrichMeta(meta, failure) {
    return {
        ...meta,
        buildFailed: true,
        buildFailure: failure,
        fireSeverity: failure.fireSeverity || "medium",
        fireMappedFrom: failure.workflowPath,
    };
}

export function applyCiFailuresToCity(fileMetaGrid, explorerFiles, ciContext) {
    if (!ciContext?.hasFailures || !explorerFiles?.length) {
        return { fileMetaGrid, explorerFiles, fireBuildingIds: [] };
    }

    const usedBuildingIds = new Set();
    const buildingFailure = new Map();

    const sortedFailures = [...(ciContext.failures || [])].sort(
        (a, b) =>
            new Date(b.time).getTime() - new Date(a.time).getTime(),
    );

    for (const failure of sortedFailures) {
        const fromMap =
            ciContext.failuresByPath.get(failure.workflowPath) || failure;
        const enriched = {
            ...fromMap,
            fireSeverity:
                fromMap.fireSeverity ||
                computeFireSeverity(fromMap, ciContext.defaultBranch),
        };

        const file = findFileForFailure(
            enriched,
            explorerFiles,
            usedBuildingIds,
        );
        if (file?.buildingId) {
            usedBuildingIds.add(file.buildingId);
            buildingFailure.set(file.buildingId, {
                ...enriched,
                mappedToPath: file.path,
            });
        }
    }

    if (buildingFailure.size === 0 && sortedFailures.length > 0) {
        const fallback = explorerFiles.find((f) => f.buildingId);
        if (fallback) {
            const worst = sortedFailures[0];
            buildingFailure.set(fallback.buildingId, {
                ...worst,
                fireSeverity: computeFireSeverity(
                    worst,
                    ciContext.defaultBranch,
                ),
                mappedToPath: fallback.path,
            });
        }
    }

    const fireBuildingIds = [...buildingFailure.keys()];

    const newGrid = (fileMetaGrid || []).map((row) =>
        row.map((cell) => {
            if (!cell?.buildingId) return cell;
            const failure = buildingFailure.get(cell.buildingId);
            return failure ? enrichMeta(cell, failure) : cell;
        }),
    );

    const newExplorer = explorerFiles.map((file) => {
        const failure = buildingFailure.get(file.buildingId);
        return failure ? enrichMeta(file, failure) : file;
    });

    return {
        fileMetaGrid: newGrid,
        explorerFiles: newExplorer,
        fireBuildingIds,
    };
}

export function enrichFileMetaGrid(fileMetaGrid, ciContext, explorerFiles) {
    return applyCiFailuresToCity(fileMetaGrid, explorerFiles, ciContext)
        .fileMetaGrid;
}

export function enrichExplorerFiles(explorerFiles, ciContext, fileMetaGrid) {
    return applyCiFailuresToCity(fileMetaGrid, explorerFiles, ciContext)
        .explorerFiles;
}
