/**
 * Normalizes issue data from building metadata for panels and missions.
 */

import { generateBuildFixSuggestion } from "./ciAnalysis.js";

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

    if (meta.hasBug && meta.primaryIssue) {
        const p = meta.primaryIssue;
        return {
            category: meta.bugType || "bug",
            issueType: p.type?.replace(/_/g, " ") || "Code Issue",
            icon: "🐞",
            severity: meta.severityLabel?.toLowerCase() || "medium",
            filePath: meta.filePath || meta.path || "—",
            fileName: meta.fileName || "—",
            title: p.title || "Code quality issue detected",
            description: p.title || "Issue detected in this file",
            detail: p,
            suggestedFix: null,
            url: p.url,
        };
    }

    if (meta.issues?.length > 0) {
        const p = meta.primaryIssue || meta.issues[0];
        const type = p.type || "issue";
        let category = "bug";
        if (type === "security") category = "security";
        else if (type === "complexity" || type === "tech_debt") {
            category = "complexity";
        }

        return {
            category,
            issueType: type.replace(/_/g, " "),
            icon:
                category === "security"
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
            suggestedFix: null,
            url: p.url,
        };
    }

    return null;
}

export function isIssueBuilding(meta) {
    return parseIssueFromMeta(meta) != null;
}

export function isBuildingRepaired(meta) {
    return Boolean(meta?.repaired || meta?.missionComplete);
}
