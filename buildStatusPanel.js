/**
 * Issue investigation panel (build failures, bugs, security, etc.)
 */

import { generateBuildFixSuggestion } from "./ciAnalysis.js";
import { isBuildingRepairedInProgress } from "./heroProgress.js";
import {
    isBuildingRepaired,
    isIssueBuilding,
    parseIssueFromMeta,
} from "./issueContext.js";
import { openHeroChallengeModal } from "./heroChallengeModal.js";

let panelEl = null;

export function initBuildStatusPanel() {
    panelEl = document.getElementById("buildStatusPanel");
}

export function hideBuildStatusPanel() {
    if (!panelEl) return;
    panelEl.classList.add("hidden");
    panelEl.innerHTML = "";
}

export function showBuildStatusPanel(meta) {
    if (!panelEl || !meta) return;

    const issue = parseIssueFromMeta(meta);
    if (!issue) return;

    const repaired =
        isBuildingRepaired(meta) ||
        isBuildingRepairedInProgress(meta.buildingId);
    const fix =
        issue.suggestedFix ||
        (meta.buildFailure
            ? generateBuildFixSuggestion(meta.buildFailure)
            : "Review the file and apply best-practice fixes.");

    let detailRows = "";

    if (issue.category === "fire" && meta.buildFailure) {
        const f = meta.buildFailure;
        detailRows = `
            <div class="build-status-row">
                <span class="build-status-label">Workflow</span>
                <span class="build-status-value">${escapeHtml(
                    f.workflowName,
                )}</span>
            </div>
            <div class="build-status-row">
                <span class="build-status-label">Failed Step</span>
                <span class="build-status-value">${escapeHtml(
                    f.failedStep,
                )}</span>
            </div>
            <div class="build-status-row">
                <span class="build-status-label">Time</span>
                <span class="build-status-value">${escapeHtml(
                    f.timeAgo || "Recently",
                )}</span>
            </div>
            <div class="build-status-row">
                <span class="build-status-label">Affected Branch</span>
                <span class="build-status-value">${escapeHtml(
                    f.branch || "main",
                )}</span>
            </div>
            ${
                f.url
                    ? `<a class="build-status-link" href="${escapeHtml(
                          f.url,
                      )}" target="_blank" rel="noopener">View workflow run on GitHub →</a>`
                    : ""
            }`;
    } else {
        detailRows = `
            <div class="build-status-row">
                <span class="build-status-label">Description</span>
                <span class="build-status-value">${escapeHtml(
                    issue.description,
                )}</span>
            </div>
            ${
                issue.url
                    ? `<a class="build-status-link" href="${escapeHtml(
                          issue.url,
                      )}" target="_blank" rel="noopener">View on GitHub →</a>`
                    : ""
            }`;
    }

    const badgeClass = repaired
        ? "build-status-badge--repaired"
        : "build-status-badge--failed";
    const badgeText = repaired
        ? "✓ BUILDING REPAIRED"
        : issue.category === "fire"
        ? "BUILD STATUS: FAILED"
        : `${issue.icon} ISSUE DETECTED`;

    panelEl.innerHTML = `
        <header class="build-status-header">
            <span class="build-status-badge ${badgeClass}">${badgeText}</span>
            <button type="button" class="build-status-close" id="buildStatusClose" aria-label="Close">×</button>
        </header>
        <div class="build-status-body">
            <div class="build-status-row">
                <span class="build-status-label">Issue Type</span>
                <span class="build-status-value">${issue.icon} ${escapeHtml(
        issue.issueType,
    )}</span>
            </div>
            <div class="build-status-row">
                <span class="build-status-label">Severity</span>
                <span class="build-status-severity build-status-severity--${
                    issue.severity
                }">${escapeHtml(issue.severity)}</span>
            </div>
            <div class="build-status-row">
                <span class="build-status-label">Affected File</span>
                <span class="build-status-value build-status-value--path">${escapeHtml(
                    issue.filePath,
                )}</span>
            </div>
            ${detailRows}
            <div class="build-status-fix">
                <span class="build-status-label">Suggested Fix Preview</span>
                <p class="build-status-fix-text">${escapeHtml(fix)}</p>
            </div>
            ${
                repaired
                    ? `<p class="build-status-repaired-note">🎉 This building was saved by a City Hero.</p>`
                    : `<button type="button" class="build-status-hero-btn" id="becomeCityHeroBtn">🦸 Become City Hero</button>
               <p class="build-status-hero-hint">Complete a quick hero challenge to repair this building and boost city health.</p>`
            }
        </div>
    `;

    panelEl.classList.remove("hidden");

    panelEl
        .querySelector("#buildStatusClose")
        ?.addEventListener("click", hideBuildStatusPanel);

    panelEl
        .querySelector("#becomeCityHeroBtn")
        ?.addEventListener("click", () => {
            openHeroChallengeModal(meta);
        });
}

export { isIssueBuilding };

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
