/**
 * Mission Control — AI challenge modal and repair flow.
 */

import { markBuildingRepairedInIndex } from "./buildingIndex.js";
import { markBuildingRepaired } from "./buildingRegistry.js";
import { celebrateBuildingRepair } from "./cityRewards.js";
import { repairFireBuilding } from "./fireBuildings.js";
import { awardMissionComplete } from "./heroProgress.js";
import {
    isBuildingVisuallyRepaired,
    parseIssueFromMeta,
} from "./issueContext.js";
import { metaHasSyntaxIssue } from "./repoHealthAnalysis.js";
import {
    buildAiRecommendation,
    createMissionChallenge,
} from "./missionChallenges.js";

let modalEl = null;
let currentMeta = null;
let currentChallenge = null;
let onMissionComplete = null;

export function initMissionControl(options = {}) {
    modalEl = document.getElementById("missionControlModal");
    onMissionComplete = options.onComplete || null;

    modalEl?.addEventListener("click", (e) => {
        if (e.target?.dataset?.closeMission) closeMissionControl();
    });
}

export function openMissionControl(meta) {
    if (!modalEl || !meta) return;

    const issue = parseIssueFromMeta(meta);
    if (!issue) return;

    if (isBuildingVisuallyRepaired(meta)) {
        renderAlreadyRepaired(issue);
        modalEl.classList.remove("hidden");
        return;
    }

    currentMeta = meta;
    currentChallenge = createMissionChallenge(issue);
    renderChallengePhase(issue, currentChallenge);
    modalEl.classList.remove("hidden");
}

export function closeMissionControl() {
    modalEl?.classList.add("hidden");
    currentMeta = null;
    currentChallenge = null;
}

function renderAlreadyRepaired(issue) {
    modalEl.innerHTML = `
        <div class="mission-control-backdrop" data-close-mission="1"></div>
        <div class="mission-control-panel">
            <header class="mission-control-header">
                <h2>✓ Building Already Saved</h2>
                <button type="button" class="mission-control-close" data-close-mission="1">×</button>
            </header>
            <p class="mission-control-intro">This building was already repaired by a City Hero.</p>
            <p class="mission-control-file">${escapeHtml(issue.filePath)}</p>
        </div>
    `;
}

function renderChallengePhase(issue, challenge) {
    const hintsHtml =
        challenge.hints
            ?.map(
                (h, i) =>
                    `<li class="mission-hint"><strong>Hint ${
                        i + 1
                    }:</strong> ${escapeHtml(h)}</li>`,
            )
            .join("") || "";

    const optionsHtml = challenge.options
        .map(
            (opt, i) =>
                `<button type="button" class="mission-option-btn" data-option-index="${i}">${escapeHtml(
                    opt,
                )}</button>`,
        )
        .join("");

    modalEl.innerHTML = `
        <div class="mission-control-backdrop" data-close-mission="1"></div>
        <div class="mission-control-panel">
            <header class="mission-control-header">
                <div>
                    <p class="mission-control-eyebrow">🛰️ MISSION CONTROL</p>
                    <h2>${escapeHtml(challenge.typeLabel)}</h2>
                </div>
                <button type="button" class="mission-control-close" data-close-mission="1">×</button>
            </header>
            <div class="mission-control-issue">
                <span>${issue.icon} ${escapeHtml(issue.issueType)}</span>
                <span class="mission-severity mission-severity--${
                    issue.severity
                }">${escapeHtml(issue.severity)}</span>
            </div>
            ${
                challenge.scenario
                    ? `<p class="mission-scenario">${escapeHtml(
                          challenge.scenario,
                      )}</p>`
                    : ""
            }
            ${hintsHtml ? `<ul class="mission-hints">${hintsHtml}</ul>` : ""}
            <p class="mission-question">${escapeHtml(challenge.question)}</p>
            <div class="mission-options" id="missionOptions">${optionsHtml}</div>
            <p class="mission-feedback hidden" id="missionFeedback"></p>
        </div>
    `;

    modalEl.querySelector("#missionOptions")?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-option-index]");
        if (!btn || !currentChallenge) return;
        const index = Number(btn.dataset.optionIndex);
        const selected = currentChallenge.options[index];
        handleAnswer(issue, selected);
    });
}

function handleAnswer(issue, selected) {
    const feedbackEl = modalEl.querySelector("#missionFeedback");
    const optionsEl = modalEl.querySelector("#missionOptions");
    const correct = selected === currentChallenge.correctAnswer;

    if (feedbackEl) {
        feedbackEl.classList.remove("hidden");
        feedbackEl.classList.toggle("mission-feedback--success", correct);
        feedbackEl.classList.toggle("mission-feedback--fail", !correct);
        feedbackEl.textContent = correct
            ? currentChallenge.successFeedback
            : currentChallenge.failFeedback;
    }

    if (!correct) return;

    if (optionsEl) {
        optionsEl.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
        });
    }

    setTimeout(() => renderRecommendationPhase(issue), 900);
}

function renderRecommendationPhase(issue) {
    const rec = buildAiRecommendation(issue);

    modalEl.querySelector(".mission-control-panel").innerHTML = `
        <header class="mission-control-header">
            <div>
                <p class="mission-control-eyebrow">🤖 AI ANALYSIS COMPLETE</p>
                <h2>Recommended Fix</h2>
            </div>
        </header>
        <div class="mission-recommendation">
            <div class="mission-rec-row"><span>Explanation</span><p>${escapeHtml(
                rec.explanation,
            )}</p></div>
            <div class="mission-rec-row"><span>Solution</span><p>${escapeHtml(
                rec.solution,
            )}</p></div>
            <div class="mission-rec-row"><span>File</span><p>${escapeHtml(
                rec.file,
            )}</p></div>
            <div class="mission-rec-row"><span>Impact</span><p>${escapeHtml(
                rec.severityImpact,
            )}</p></div>
        </div>
        <button type="button" class="mission-complete-btn" id="missionCompleteBtn">🦸 Deploy Fix &amp; Save City</button>
    `;

    modalEl
        .querySelector("#missionCompleteBtn")
        ?.addEventListener("click", () => completeMission(issue));
}

function completeMission(issue) {
    if (!currentMeta) return;

    const rewards = awardMissionComplete(
        currentMeta.buildingId,
        issue.severity,
    );

    if (issue.category === "fire" || metaHasSyntaxIssue(currentMeta)) {
        repairFireBuilding(currentMeta.buildingId);
    }

    markBuildingRepaired(currentMeta.buildingId);
    markBuildingRepairedInIndex(currentMeta.buildingId);
    celebrateBuildingRepair(currentMeta.buildingId);

    renderSuccessPhase(rewards);

    if (onMissionComplete) {
        onMissionComplete({ ...currentMeta, repaired: true }, issue, rewards);
    }
}

function renderSuccessPhase(rewards) {
    modalEl.querySelector(".mission-control-panel").innerHTML = `
        <div class="mission-success">
            <div class="mission-success-icon">✓</div>
            <h2 class="mission-success-title">City Saved!</h2>
            <p class="mission-success-sub">Building Repaired · Issue Resolved</p>
            <div class="mission-rewards">
                <span>+${rewards?.xpGain || 100} XP</span>
                <span>+${rewards?.healthGain || 10} City Health</span>
                <span>+${rewards?.badgeGain || 1} Hero Badge</span>
            </div>
            <p class="mission-success-note">Repository health improved — the city glows green!</p>
            <button type="button" class="mission-complete-btn" data-close-mission="1">Return to City</button>
        </div>
    `;

    setTimeout(() => closeMissionControl(), 5000);
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
