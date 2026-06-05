/**
 * Hero Challenge Modal — choose and complete a challenge before repairing a building.
 */

import { markBuildingRepairedInIndex } from "./buildingIndex.js";
import { markBuildingRepaired } from "./buildingRegistry.js";
import { celebrateBuildingRepair } from "./cityRewards.js";
import { repairFireBuilding } from "./fireBuildings.js";
import { startAiRemediationFlow } from "./heroAiRemediation.js";
import { getChallengeTypeById, HERO_CHALLENGE_TYPES } from "./heroChallenges/challengeTypes.js";
import { awardHeroChallengeComplete } from "./heroProgress.js";
import {
    isBuildingRepaired,
    isBuildingVisuallyRepaired,
    parseIssueFromMeta,
} from "./issueContext.js";
import { metaHasSyntaxIssue } from "./repoHealthAnalysis.js";

let modalEl = null;
let currentMeta = null;
let challengeCleanup = null;
let activeChallengeKind = null;
let onChallengeComplete = null;
/** @type {{ owner: string, repo: string, fullName: string, defaultBranch: string } | null} */
let repoContext = null;

export function setHeroChallengeRepoContext(ctx) {
    repoContext = ctx;
}

export function initHeroChallengeModal(options = {}) {
    modalEl = document.getElementById("heroChallengeModal");
    onChallengeComplete = options.onComplete || null;

    modalEl?.addEventListener("click", (e) => {
        if (e.target?.dataset?.closeHeroChallenge) closeHeroChallengeModal();
    });
}

export function openHeroChallengeModal(meta) {
    if (!modalEl || !meta) return;

    const issue = parseIssueFromMeta(meta);
    if (!issue) return;

    currentMeta = meta;

    if (isBuildingVisuallyRepaired(meta)) {
        renderAlreadyRepaired(issue);
        modalEl.classList.remove("hidden");
        return;
    }

    renderChoosePhase(issue);
    modalEl.classList.remove("hidden");
}

export function closeHeroChallengeModal() {
    destroyActiveChallenge();
    modalEl?.classList.add("hidden");
    currentMeta = null;
}

function destroyActiveChallenge() {
    if (challengeCleanup) {
        challengeCleanup();
        challengeCleanup = null;
    }
}

function renderAlreadyRepaired(issue) {
    modalEl.innerHTML = `
        <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
        <div class="hero-challenge-panel">
            <header class="hero-challenge-header">
                <h2>✓ Building Already Saved</h2>
                <button type="button" class="hero-challenge-close" data-close-hero-challenge="1">×</button>
            </header>
            <p class="hero-challenge-intro">This building was already repaired by a City Hero.</p>
            <p class="hero-challenge-file">${escapeHtml(issue.filePath)}</p>
        </div>
    `;
}

function renderChoosePhase(issue) {
    destroyActiveChallenge();

    const optionsHtml = HERO_CHALLENGE_TYPES.map(
        (type) =>
            `<button type="button" class="hero-challenge-choice-btn" data-challenge-id="${type.id}">
                <span class="hero-challenge-choice-icon">${type.icon}</span>
                <span class="hero-challenge-choice-title">${escapeHtml(type.title)}</span>
                <span class="hero-challenge-choice-desc">${escapeHtml(type.description)}</span>
            </button>`,
    ).join("");

    modalEl.innerHTML = `
        <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
        <div class="hero-challenge-panel">
            <header class="hero-challenge-header">
                <div>
                    <p class="hero-challenge-eyebrow">🦸 HERO CHALLENGE</p>
                    <h2>Repair This Building</h2>
                </div>
                <button type="button" class="hero-challenge-close" data-close-hero-challenge="1">×</button>
            </header>
            <div class="hero-challenge-issue">
                <span>${issue.icon} ${escapeHtml(issue.issueType)}</span>
                <span class="hero-challenge-severity hero-challenge-severity--${issue.severity}">${escapeHtml(issue.severity)}</span>
            </div>
            <p class="hero-challenge-intro">How would you like to help repair this building?</p>
            <p class="hero-challenge-file">${escapeHtml(issue.filePath)}</p>
            <div class="hero-challenge-choices" id="heroChallengeChoices">${optionsHtml}</div>
        </div>
    `;

    modalEl.querySelector("#heroChallengeChoices")?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-challenge-id]");
        if (!btn) return;
        const type = getChallengeTypeById(btn.dataset.challengeId);
        if (type) renderChallengePhase(issue, type);
    });
}

function renderChallengePhase(issue, type) {
    destroyActiveChallenge();
    activeChallengeKind = type.id;

    modalEl.innerHTML = `
        <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
        <div class="hero-challenge-panel">
            <header class="hero-challenge-header">
                <div>
                    <p class="hero-challenge-eyebrow">🦸 HERO CHALLENGE</p>
                    <h2>${type.icon} ${escapeHtml(type.title)}</h2>
                </div>
                <button type="button" class="hero-challenge-close" data-close-hero-challenge="1">×</button>
            </header>
            <div class="hero-challenge-issue">
                <span>${issue.icon} ${escapeHtml(issue.issueType)}</span>
            </div>
            <div id="heroChallengeMount"></div>
            <button type="button" class="hero-challenge-back-btn" id="heroChallengeBackBtn">← Choose another challenge</button>
        </div>
    `;

    const mount = modalEl.querySelector("#heroChallengeMount");
    if (!mount) return;

    challengeCleanup = type.create(mount, {
        onSuccess: () => beginAiRemediationPhase(issue),
        onFail: () => {},
    });

    modalEl.querySelector("#heroChallengeBackBtn")?.addEventListener("click", () => {
        renderChoosePhase(issue);
    });
}

function beginAiRemediationPhase(issue) {
    if (!currentMeta || !modalEl) return;

    destroyActiveChallenge();

    const ctx = repoContext || {
        owner: "unknown",
        repo: "unknown",
        fullName: "unknown/unknown",
        defaultBranch: "main",
    };

    startAiRemediationFlow(modalEl, {
        issue,
        meta: currentMeta,
        repoContext: ctx,
        onFinalizeRepair: (fixResult) => finalizeBuildingRepair(issue, fixResult),
        onCancel: () => renderChoosePhase(issue),
    });
}

function finalizeBuildingRepair(issue, fixResult = null) {
    if (!currentMeta) return;

    renderRepairingPhase();

    setTimeout(() => {
        const rewards = awardHeroChallengeComplete(
            currentMeta.buildingId,
            activeChallengeKind,
        );

        if (issue.category === "fire" || metaHasSyntaxIssue(currentMeta)) {
            repairFireBuilding(currentMeta.buildingId);
        }

        markBuildingRepaired(currentMeta.buildingId);
        markBuildingRepairedInIndex(currentMeta.buildingId);
        celebrateBuildingRepair(currentMeta.buildingId);

        renderSuccessPhase(rewards, fixResult);

        if (onChallengeComplete) {
            onChallengeComplete(
                { ...currentMeta, repaired: true },
                issue,
                rewards,
            );
        }
    }, 1200);
}

function renderRepairingPhase() {
    destroyActiveChallenge();
    const panel = modalEl.querySelector(".hero-challenge-panel");
    if (!panel) return;

    panel.innerHTML = `
        <div class="hero-challenge-repairing">
            <div class="hero-challenge-repairing-icon" aria-hidden="true">✨</div>
            <h2 class="hero-challenge-repairing-title">Building Repaired</h2>
            <p class="hero-challenge-repairing-sub">Restoring city health…</p>
        </div>
    `;
}

function renderSuccessPhase(rewards, fixResult = null) {
    const panel = modalEl.querySelector(".hero-challenge-panel");
    if (!panel) {
        modalEl.innerHTML = `
            <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
            <div class="hero-challenge-panel"></div>
        `;
    }

    const target = modalEl.querySelector(".hero-challenge-panel");
    target.innerHTML = `
        <div class="hero-challenge-success">
            <div class="hero-challenge-success-icon">✓</div>
            <h2 class="hero-challenge-success-title">Issue Resolved!</h2>
            <p class="hero-challenge-success-sub">✨ Building Repaired · 🏢 City Health Improved · 💚 Health Restored</p>
            ${
                fixResult?.github?.prUrl
                    ? `<p class="hero-challenge-success-github"><a href="${escapeHtml(fixResult.github.prUrl)}" target="_blank" rel="noopener">View Pull Request</a></p>`
                    : fixResult?.github?.commitUrl
                    ? `<p class="hero-challenge-success-github"><a href="${escapeHtml(fixResult.github.commitUrl)}" target="_blank" rel="noopener">View Commit</a></p>`
                    : ""
            }
            <div class="hero-challenge-rewards">
                <span>+${rewards?.xpGain ?? 100} Hero XP</span>
                <span>+${rewards?.buildingGain ?? 1} Building Saved</span>
                <span>+1 Repository Issue Resolved</span>
                <span>+${rewards?.healthGain ?? 1} City Health</span>
            </div>
            <p class="hero-challenge-success-hero">🎉 Thank You, City Hero!</p>
            ${
                fixResult?.github
                    ? `<button type="button" class="hero-challenge-reload-btn" id="heroChallengeReloadCity">Reload City</button>`
                    : ""
            }
            <button type="button" class="hero-challenge-done-btn" data-close-hero-challenge="1">Return to City</button>
        </div>
    `;

    target
        .querySelector("#heroChallengeReloadCity")
        ?.addEventListener("click", () => window.location.reload());

    setTimeout(() => closeHeroChallengeModal(), 6000);
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
