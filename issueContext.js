/**
 * Normalizes issue data from building metadata for panels and missions.
 */

import { generateBuildFixSuggestion } from "./ciAnalysis.js";
import { isBuildingRepairedInSession } from "./heroProgress.js";
import { metaHasSyntaxIssue } from "./repoHealthAnalysis.js";

/** Prefer syntax issues for display when a file has multiple issue types. */
export function pickPrimaryIssue(meta) {
    const issues = meta?.issues || [];
    return (
        issues.find((issue) => issue.type === "syntax") ||
        meta?.primaryIssue ||
        issues[0] ||
        null
    );
}

export function parseIssueFromMeta(meta) {
    if (!meta) return null;

    if (meta.repaired || meta.missionComplete) {
        const filePath = meta.filePath || meta.path || "—";
        if (meta.buildFailure || meta.buildFailed) {
            return {
                category: "fire",
                issueType: "Build Failed",
                icon: "🔥",
                severity:
                    meta.fireSeverity ||
                    meta.buildFailure?.fireSeverity ||
                    "medium",
                filePath,
                fileName: meta.fileName || "—",
                title:
                    meta.buildFailure?.workflowName || "CI/CD Pipeline Failed",
                description: meta.buildFailure
                    ? `${meta.buildFailure.reason}: ${meta.buildFailure.failedStep}`
                    : "Previously failed build — now repaired",
                detail: meta.buildFailure,
                suggestedFix: meta.buildFailure
                    ? generateBuildFixSuggestion(meta.buildFailure)
                    : null,
                url: meta.buildFailure?.url,
                repaired: true,
            };
        }
    }

    if (meta.buildFailed && meta.buildFailure) {
        const f = meta.buildFailure;
        return {
            category: "fire",
            issueType: "Build Failed",
            icon: "🔥",
            severity: meta.fireSeverity || f.fireSeverity || "medium",
            filePath: meta.filePath || meta.path || f.mappedToPath || "—",
            fileName: meta.fileName || "—",
            title: f.workflowName || "CI/CD Pipeline Failed",
            description: `${f.reason}: ${f.failedStep} on branch ${
                f.branch || "main"
            }`,
            detail: f,
            suggestedFix: generateBuildFixSuggestion(f),
            url: f.url,
        };
    }

    if (meta.hasBug || meta.issues?.length > 0) {
        const p = pickPrimaryIssue(meta);
        if (!p) return null;
        const type = p.type || "issue";
        let category = "bug";
        if (type === "security") category = "security";
        else if (type === "complexity" || type === "tech_debt") {
            category = "complexity";
        }

        if (type === "syntax") category = "syntax";

        return {
            category,
            issueType: type.replace(/_/g, " "),
            icon:
                type === "syntax"
                    ? "⚠"
                    : category === "security"
                    ? "🔒"
                    : category === "complexity"
                    ? "🤖"
                    : "🐞",
            severity:
                meta.severityLabel?.toLowerCase() || p.severity || "medium",
            filePath: meta.filePath || meta.path || "—",
            fileName: meta.fileName || "—",
            title: p.title || "Repository issue",
            description: p.title || "Issue detected",
            detail: p,
            suggestedFix: p.title || null,
            url: p.url,
        };
    }

    return null;
}

export function isIssueBuilding(meta) {
    return parseIssueFromMeta(meta) != null;
}

export function isBuildingRepaired(meta) {
    return Boolean(
        meta?.repaired ||
            meta?.missionComplete ||
            (meta?.buildingId && isBuildingRepairedInSession(meta.buildingId)),
    );
}

/** True only when repair is recorded and no outstanding issues remain. */
export function isBuildingVisuallyRepaired(meta) {
    if (!meta) return false;
    if (metaHasSyntaxIssue(meta) || (meta.buildFailed && meta.buildFailure)) {
        return false;
    }
    return isBuildingRepaired(meta);
}
