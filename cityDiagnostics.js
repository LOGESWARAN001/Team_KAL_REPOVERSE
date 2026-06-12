/**
 * Debug logging for repository → city mapping and issue visualization.
 * Enable with ?debug=1 or localStorage.github_city_debug = "1"
 */

export function isCityDebugEnabled() {
    try {
        if (typeof window === "undefined") return false;
        const params = new URLSearchParams(window.location.search);
        if (params.get("debug") === "1") return true;
        return localStorage.getItem("github_city_debug") === "1";
    } catch {
        return false;
    }
}

const prefix = "[RepoVerse]";

function debugLog(category, payload) {
    if (!isCityDebugEnabled()) return;
    console.log(`${prefix} ${category}`, payload);
}

export function logFileDetected(file) {
    debugLog("File detected", {
        fileName: file?.name,
        filePath: file?.path,
        buildingId: file?.buildingId,
        folder: file?.folder,
    });
}

export function logIssueDetected(issue) {
    debugLog("Issue detected", issue);
}

export function logSeverityAssigned(payload) {
    debugLog("Severity assigned", payload);
}

export function logBuildingMapped(payload) {
    debugLog("Building mapped", payload);
}

export function logFireActivated(payload) {
    console.log(`${prefix} Fire effect activated`, payload);
}

export function logFireSkipped(payload) {
    debugLog("Fire effect skipped", payload);
}

export function logSelection(payload) {
    if (!isCityDebugEnabled()) return;
    const status = payload.selectionStatus || payload.status || "UNKNOWN";
    console.log(`${prefix} Selection`, {
        selectedFile: payload.selectedFile,
        resolvedBuilding: payload.resolvedBuilding,
        expectedBuilding: payload.expectedBuilding,
        buildingPosition: payload.buildingPosition,
        selectionStatus: status,
        failureReason: payload.failureReason,
    });
}

export function logHealthScanSummary(summary) {
    console.log(`${prefix} Repository health scan`, summary);
}

export function logScanPipeline(stage, payload) {
    debugLog(stage, payload);
}

export function logIssueVisualization(payload) {
    if (!isCityDebugEnabled()) return;
    console.log(`${prefix} Issue visualization`, {
        filePath: payload.filePath,
        issuesFound: payload.issuesFound,
        severity: payload.severity,
        mappedBuilding: payload.mappedBuilding,
        fireTrigger: payload.fireTrigger,
        bugIndicator: payload.bugIndicator,
        healthScore: payload.healthScore,
        reason: payload.reason,
    });
}

export function logIssueFileAudit(payload) {
    if (!isCityDebugEnabled()) return;
    console.log(`${prefix} Issue file audit`, {
        filePath: payload.filePath,
        fileType: payload.fileType,
        issuesFound: payload.issueCount ?? payload.issuesFound,
        severity: payload.severity,
        buildingId: payload.buildingId,
        fireActive: payload.fireActive,
        bugIndicator: payload.bugIndicator,
        reason: payload.reason,
    });
}

/** Temporary audit log for content-based syntax scanning (always on). */
export function logSyntaxScanAudit(payload) {
    console.log(`${prefix} Syntax scan`, {
        filePath: payload.filePath,
        fileType: payload.fileType,
        issuesFound: payload.issuesFound,
        severity: payload.severity,
        buildingId: payload.buildingId,
        fireActive: payload.fireActive,
    });
}
