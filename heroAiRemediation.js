/**
 * Post-challenge AI scan, fix review, and GitHub commit workflow.
 * Uses Azure OpenAI to analyse the issue and generate a suggested fix.
 */

import { diffToPatch } from "./diffUtils.js";
import { hasGithubToken } from "./githubAuth.js";
import { applyFixWorkflow } from "./githubCommit.js";
import {
    checkRepoPermissions,
    forkRepository,
    loginWithGitHubToken,
    refreshGitHubUser,
} from "./githubPermissions.js";
import { recordBranchFix } from "./branchFixRegistry.js";
import { fetchRepoFileContent } from "./repoFileContent.js";

// ─── Azure OpenAI Configuration ──────────────────────────────────────────────
// Replace these values with your Azure OpenAI resource details,
// or load them from your environment / config module.
const AZURE_OPENAI_ENDPOINT =
    "https://trucsopenai.openai.azure.com/openai/v1/chat/completions";
const AZURE_OPENAI_API_KEY = import.meta.env.VITE_AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_DEPLOYMENT = "gpt-4.1-mini";
const AZURE_OPENAI_API_VERSION = "2025-03-01";

// Scan step labels shown in the progress UI
const SCAN_STEPS = [
    { label: "Preparing issue context…" },
    { label: "Sending to Azure OpenAI…" },
    { label: "Analysing issue & root cause…" },
    { label: "Generating suggested fix…" },
    { label: "Building diff view…" },
];
// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * @param {HTMLElement} modalEl
 * @param {{
 *   issue: object,
 *   meta: object,
 *   repoContext: { owner: string, repo: string, fullName: string, defaultBranch: string },
 *   onFinalizeRepair: (fixResult: object | null) => void,
 *   onCancel: () => void,
 * }} options
 */
export function startAiRemediationFlow(modalEl, options) {
    const { issue, meta, repoContext, onFinalizeRepair, onCancel } = options;
    renderScanPhase(
        modalEl,
        issue,
        meta,
        repoContext,
        onFinalizeRepair,
        onCancel,
    );
}

// ─── Scan phase ───────────────────────────────────────────────────────────────

function renderScanPhase(
    modalEl,
    issue,
    meta,
    repoContext,
    onFinalizeRepair,
    onCancel,
) {
    const stepsHtml = SCAN_STEPS.map(
        (s, i) =>
            `<li class="hero-ai-scan-step" id="heroAiScanStep${i}">
                <span class="hero-ai-scan-step__icon" aria-hidden="true">○</span>
                <span class="hero-ai-scan-step__label">${escapeHtml(
                    s.label,
                )}</span>
            </li>`,
    ).join("");

    modalEl.innerHTML = `
        <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
        <div class="hero-challenge-panel hero-challenge-panel--ai">
            <header class="hero-challenge-header">
                <div>
                    <p class="hero-challenge-eyebrow">🤖 AI REPOSITORY SCAN</p>
                    <h2>Scanning Repository…</h2>
                </div>
                <button type="button" class="hero-challenge-close" data-close-hero-challenge="1">×</button>
            </header>
            <div class="hero-ai-scan">
                <div class="hero-ai-scan__visual" aria-hidden="true">
                    <div class="hero-ai-scan__pulse"></div>
                    <span class="hero-ai-scan__emoji">🔍</span>
                </div>
                <p class="hero-ai-scan__status" id="heroAiScanStatus">Initializing scan…</p>
                <div class="hero-ai-scan__progress" aria-label="Scan progress">
                    <div class="hero-ai-scan__progress-fill" id="heroAiScanProgress" style="width:0%"></div>
                </div>
                <ul class="hero-ai-scan__steps">${stepsHtml}</ul>
                <p class="hero-ai-scan__file">${escapeHtml(issue.filePath)}</p>
            </div>
        </div>
    `;

    runScanAnimation(
        modalEl,
        issue,
        meta,
        repoContext,
        onFinalizeRepair,
        onCancel,
    );
}

async function runScanAnimation(
    modalEl,
    issue,
    meta,
    repoContext,
    onFinalizeRepair,
    onCancel,
) {
    const progressEl = modalEl.querySelector("#heroAiScanProgress");
    const statusEl = modalEl.querySelector("#heroAiScanStatus");

    const advanceStep = (stepIndex) => {
        const pct = ((stepIndex + 1) / SCAN_STEPS.length) * 100;
        if (progressEl) progressEl.style.width = `${pct}%`;
        if (statusEl)
            statusEl.textContent = SCAN_STEPS[stepIndex]?.label || "Analysing…";

        for (let i = 0; i < SCAN_STEPS.length; i++) {
            const el = modalEl.querySelector(`#heroAiScanStep${i}`);
            if (!el) continue;
            const icon = el.querySelector(".hero-ai-scan-step__icon");
            if (i < stepIndex) {
                el.classList.add("hero-ai-scan-step--done");
                if (icon) icon.textContent = "✓";
            } else if (i === stepIndex) {
                el.classList.add("hero-ai-scan-step--active");
                if (icon) icon.textContent = "◎";
            }
        }
    };

    let fixResult = null;

    try {
        fixResult = await runAzureAiScanAndFix(
            repoContext,
            issue,
            meta,
            advanceStep,
        );
    } catch (err) {
        if (statusEl)
            statusEl.textContent = `Scan failed: ${
                err?.message || "Unknown error"
            }`;
        return;
    }

    await delay(500);
    renderReviewPhase(
        modalEl,
        issue,
        meta,
        repoContext,
        fixResult,
        onFinalizeRepair,
        onCancel,
    );
}

// ─── Azure OpenAI scan & fix ──────────────────────────────────────────────────

/**
 * Fetches the file content, calls Azure OpenAI, and returns a fixResult object
 * shaped identically to what the old aiFixService produced so the rest of the
 * UI (review phase, diff view, GitHub commit) works unchanged.
 *
 * @param {object}   repoContext
 * @param {object}   issue
 * @param {object}   meta
 * @param {function} onStep  – called with (stepIndex) as each stage completes
 * @returns {Promise<object>} fixResult
 */
async function runAzureAiScanAndFix(repoContext, issue, meta, onStep) {
    // Step 0 – fetch original file content for diff display only
    // Step 0 – fetch real file content
    onStep(0);
    const fileData = await fetchRepoFileContent(
        repoContext.owner,
        repoContext.repo,
        issue.filePath,
        repoContext.defaultBranch,
    );

    // GitHub API returns base64-encoded content with newlines — decode it fully
    const rawContent = fileData?.content ?? "";
    const originalContent = rawContent.includes("base64")
        ? atob(rawContent.replace(/\s/g, "")) // strip whitespace then decode
        : rawContent;
    const fileSha = fileData?.sha ?? null;

    console.log("[AI Scan] File length:", originalContent.length, "chars");
    console.log("[AI Scan] File preview:", originalContent.slice(0, 200));

    // Step 1 – send full content + path to Azure OpenAI
    onStep(1);
    const aiResponse = await callAzureOpenAI(
        issue,
        repoContext,
        originalContent,
    );

    // Step 2 – parse analysis
    onStep(2);
    const analysis = parseAiAnalysis(aiResponse);

    // Step 3 – build diff using fetched original vs AI fixed content
    onStep(3);
    const fixedContent = analysis.fixedContent ?? originalContent;
    const diff = buildLineDiff(originalContent, fixedContent);
    const canAutoFix = fixedContent !== originalContent;

    const branchName = `fix/${issue.filePath.replace(
        /[^a-zA-Z0-9]/g,
        "-",
    )}-${Date.now()}`.slice(0, 80);

    // Step 4 – diff view ready
    onStep(4);

    return {
        issueType: analysis.issueType ?? issue.issueType ?? "Unknown Issue",
        severity: analysis.severity ?? issue.severity ?? "medium",
        rootCause: analysis.rootCause ?? "Could not determine root cause.",
        explanation: analysis.explanation ?? "No explanation available.",
        suggestedFix: analysis.suggestedFix ?? "No fix suggestion available.",
        filePath: issue.filePath,
        originalContent, // ← real file content for diff left pane
        fixedContent,
        fileSha, // ← real SHA for GitHub commit
        diff,
        canAutoFix,
        branchName,
        commitMessage:
            analysis.commitMessage ??
            `fix: resolve ${issue.issueType} in ${issue.filePath}`,
        prTitle: analysis.prTitle ?? `Fix: ${issue.issueType}`,
        prDescription: analysis.prDescription ?? analysis.explanation ?? "",
    };
}

/**
 * Calls the Azure OpenAI Chat Completions endpoint and returns the raw
 * assistant message text.
 */
async function callAzureOpenAI(issue, repoContext, originalContent) {
    const url = `${AZURE_OPENAI_ENDPOINT}`;

    const fullFilePath = `https://github.com/${repoContext.owner}/${repoContext.repo}/blob/${repoContext.defaultBranch}/${issue.filePath}`;

    const systemPrompt = `You are a senior software engineer and code reviewer.
You analyse code files for issues, explain root causes clearly, and provide exact fixed code.
Always respond with valid JSON only — no markdown fences, no extra text.`;

    const userPrompt = `Analyse the attached code file for the reported issue and respond with a JSON object.

## Reported Issue
- Type: ${issue.issueType ?? "Unknown"}
- Severity: ${issue.severity ?? "medium"}
- File Path: ${fullFilePath}
- Description: ${issue.description ?? issue.issueType ?? ""}
-----FILE START-----

## File Content

${originalContent}

-----FILE END-----

## Required JSON Response Shape
{
  "issueType":      "<confirmed or refined issue type>",
  "severity":       "<critical|high|medium|low|info>",
  "rootCause":      "<concise root cause, 1-2 sentences>",
  "explanation":    "<developer-friendly explanation of the problem>",
  "suggestedFix":   "<human-readable description of what to change>",
  "fixedContent":   "<complete corrected file content as a string, or null if no code change is needed>",
  "commitMessage":  "<conventional commit message, e.g. fix: …>",
  "prTitle":        "<short pull-request title>",
  "prDescription":  "<markdown pull-request body explaining the change>"
}

Rules:
Before reporting an issue:

1. Identify the issue.
2. Re-read the exact code.
3. Verify the issue exists.
4. Only then include it in the response.

- "fixedContent" must be the FULL file with the fix applied, not just a snippet.
- "fixedContent" must be based ONLY on the attached file content — do NOT invent or rewrite the file.
- If the file content is empty or the issue cannot be auto-fixed, set "fixedContent" to null.
- Keep all unchanged lines exactly as-is.
- Do not include markdown code fences in "fixedContent".`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: AZURE_OPENAI_DEPLOYMENT,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
            temperature: 0.2,
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`Azure OpenAI error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Azure OpenAI returned an empty response.");
    return text;
}

/**
 * Safely parses the JSON string returned by Azure OpenAI.
 * Strips accidental markdown fences if the model added them.
 */
function parseAiAnalysis(rawText) {
    try {
        // Strip markdown fences anywhere in the string (not just start/end)
        const clean = rawText.replace(/```(?:json)?\s*/gi, "").trim();

        return JSON.parse(clean);
    } catch {
        // Attempt to extract a JSON object via regex as a last resort
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                // fall through
            }
        }

        // Final fallback — at least show the raw explanation
        return {
            issueType: "Unknown",
            severity: "medium",
            rootCause: "Could not parse AI response.",
            explanation: rawText,
            fixedContent: null,
        };
    }
}

/**
 * Produces a line-level diff array compatible with renderDiffPanels().
 * Each entry: { type: "same"|"remove"|"add", content, oldLine?, newLine? }
 */
function buildLineDiff(original, fixed) {
    const oldLines = original.split("\n");
    const newLines = fixed.split("\n");

    // Simple LCS-based diff
    const lcs = computeLcs(oldLines, newLines);
    const diff = [];

    let oi = 0,
        ni = 0,
        li = 0;
    let oldLineNum = 1,
        newLineNum = 1;

    while (oi < oldLines.length || ni < newLines.length) {
        if (
            li < lcs.length &&
            oi < oldLines.length &&
            ni < newLines.length &&
            oldLines[oi] === lcs[li] &&
            newLines[ni] === lcs[li]
        ) {
            diff.push({
                type: "same",
                content: oldLines[oi],
                oldLine: oldLineNum++,
                newLine: newLineNum++,
            });
            oi++;
            ni++;
            li++;
        } else if (
            ni < newLines.length &&
            (li >= lcs.length || newLines[ni] !== lcs[li])
        ) {
            diff.push({
                type: "add",
                content: newLines[ni],
                newLine: newLineNum++,
            });
            ni++;
        } else {
            diff.push({
                type: "remove",
                content: oldLines[oi],
                oldLine: oldLineNum++,
            });
            oi++;
        }
    }

    return diff;
}

function computeLcs(a, b) {
    const m = a.length,
        n = b.length;
    // For very large files, fall back to an empty LCS to avoid O(m*n) memory
    if (m * n > 500_000) return [];
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] =
                a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1] + 1
                    : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const result = [];
    let i = m,
        j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            result.unshift(a[i - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
    }
    return result;
}

// ─── Review phase (unchanged from original) ───────────────────────────────────

function renderReviewPhase(
    modalEl,
    issue,
    meta,
    repoContext,
    fixResult,
    onFinalizeRepair,
    onCancel,
) {
    const canCommit = Boolean(fixResult.canAutoFix);
    const diffHtml = renderDiffPanels(fixResult);

    modalEl.innerHTML = `
        <div class="hero-challenge-backdrop" data-close-hero-challenge="1"></div>
        <div class="hero-challenge-panel hero-challenge-panel--ai hero-challenge-panel--review">
            <header class="hero-challenge-header">
                <div>
                    <p class="hero-challenge-eyebrow">📝 CODE REVIEW</p>
                    <h2>Review AI Fix</h2>
                </div>
                <button type="button" class="hero-challenge-close" data-close-hero-challenge="1">×</button>
            </header>

            <div class="hero-ai-explanation">
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">Issue</span>
                    <span class="hero-ai-explanation__value">${escapeHtml(
                        fixResult.issueType,
                    )}</span>
                </div>
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">Severity</span>
                    <span class="hero-ai-explanation__value hero-challenge-severity hero-challenge-severity--${escapeHtml(
                        issue.severity,
                    )}">${escapeHtml(fixResult.severity)}</span>
                </div>
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">Root Cause</span>
                    <span class="hero-ai-explanation__value">${escapeHtml(
                        fixResult.rootCause,
                    )}</span>
                </div>
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">Explanation</span>
                    <span class="hero-ai-explanation__value">${escapeHtml(
                        fixResult.explanation,
                    )}</span>
                </div>
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">Suggested Fix</span>
                    <span class="hero-ai-explanation__value">${escapeHtml(
                        fixResult.suggestedFix,
                    )}</span>
                </div>
                <div class="hero-ai-explanation__row">
                    <span class="hero-ai-explanation__label">File</span>
                    <span class="hero-ai-explanation__value hero-ai-explanation__file">${escapeHtml(
                        fixResult.filePath,
                    )}</span>
                </div>
            </div>

            <div class="hero-ai-diff">
                <div class="hero-ai-diff__header">
                    <span>Current Code</span>
                    <span>AI Suggested Fix</span>
                </div>
                <div class="hero-ai-diff__body">${diffHtml}</div>
            </div>

            ${
                !canCommit
                    ? `<p class="hero-ai-no-fix-warning">⚠️ The AI could not generate a file change for this issue. Copy or download the fix manually — commit and pull request are disabled until the file content differs.</p>`
                    : ""
            }
            <div class="hero-ai-actions" id="heroAiActions">
                <button type="button" class="hero-ai-btn hero-ai-btn--ghost"     id="heroAiCancel">Cancel</button>
                <button type="button" class="hero-ai-btn hero-ai-btn--secondary" id="heroAiCopyFix">Copy Fix</button>
                <button style="display:none" type="button" class="hero-ai-btn hero-ai-btn--secondary" id="heroAiDownloadPatch">Download Patch</button>
                <button style="display:none"  type="button" class="hero-ai-btn hero-ai-btn--primary"   id="heroAiApplyFix">${
                    canCommit ? "Apply Fix" : "Review Fix"
                }</button>
                <button type="button" class="hero-ai-btn hero-ai-btn--commit hidden" id="heroAiCommit"    ${
                    canCommit ? "" : "disabled"
                }>Apply Fix &amp; Commit</button>
                <button type="button" class="hero-ai-btn hero-ai-btn--pr    hidden" id="heroAiCreatePr"  ${
                    canCommit ? "" : "disabled"
                }>Apply Fix &amp; Create Pull Request</button>
            </div>
            <p class="hero-ai-permission-note hidden" id="heroAiPermissionNote"></p>
            <p class="hero-ai-feedback hidden"        id="heroAiFeedback"></p>
        </div>
    `;

    modalEl.querySelector("#heroAiCancel")?.addEventListener("click", onCancel);

    modalEl.querySelector("#heroAiCopyFix")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(fixResult.fixedContent || "");
        showFeedback(modalEl, "Fix copied to clipboard.");
    });

    modalEl
        .querySelector("#heroAiDownloadPatch")
        ?.addEventListener("click", () => {
            const patch = diffToPatch(fixResult.diff, fixResult.filePath);
            downloadText(
                `${fixResult.filePath.replace(/\//g, "_")}.patch`,
                patch,
            );
            showFeedback(modalEl, "Patch downloaded.");
        });

    modalEl.querySelector("#heroAiApplyFix")?.addEventListener("click", () => {
        if (!canCommit) {
            showFeedback(
                modalEl,
                "No automatic file change was generated. Edit the file manually or copy the suggested fix.",
                true,
            );
            return;
        }
        showFeedback(
            modalEl,
            "Fix approved locally. Connect GitHub to commit or create a PR.",
        );
        revealGitHubActions(modalEl, repoContext, fixResult);
    });

    modalEl.querySelector("#heroAiCommit")?.addEventListener("click", () => {
        if (!canCommit) return;
        handleGitHubAction(
            modalEl,
            issue,
            meta,
            repoContext,
            fixResult,
            false,
            onFinalizeRepair,
        );
    });

    modalEl.querySelector("#heroAiCreatePr")?.addEventListener("click", () => {
        if (!canCommit) return;
        handleGitHubAction(
            modalEl,
            issue,
            meta,
            repoContext,
            fixResult,
            true,
            onFinalizeRepair,
        );
    });

    if (hasGithubToken() && canCommit) {
        revealGitHubActions(modalEl, repoContext, fixResult, true);
    }
}

// ─── GitHub actions (unchanged from original) ────────────────────────────────

async function revealGitHubActions(
    modalEl,
    repoContext,
    fixResult,
    silent = false,
) {
    const commitBtn = modalEl.querySelector("#heroAiCommit");
    const prBtn = modalEl.querySelector("#heroAiCreatePr");
    const noteEl = modalEl.querySelector("#heroAiPermissionNote");

    if (!hasGithubToken()) {
        renderGitHubLogin(modalEl, repoContext, fixResult);
        return;
    }

    try {
        const perms = await checkRepoPermissions(
            repoContext.owner,
            repoContext.repo,
        );
        const user = await refreshGitHubUser();

        commitBtn?.classList.remove("hidden");
        prBtn?.classList.remove("hidden");

        if (!perms.hasWriteAccess) {
            commitBtn?.setAttribute("disabled", "true");
            if (noteEl) {
                noteEl.classList.remove("hidden");
                noteEl.textContent =
                    "You do not have permission to push to this repository. Fork and create a PR, or copy/download the fix.";
            }
            if (prBtn) {
                prBtn.textContent = "Fork & Create Pull Request";
                prBtn.dataset.forkMode = "1";
            }
        } else if (noteEl) {
            noteEl.classList.remove("hidden");
            noteEl.textContent = `Authenticated as @${
                user?.login || "user"
            } — write access confirmed. Changes will use branch ${
                fixResult.branchName
            }.`;
        }

        if (!silent)
            showFeedback(
                modalEl,
                "GitHub connected. Choose how to apply the fix.",
            );
    } catch (err) {
        showFeedback(
            modalEl,
            `Permission check failed: ${err?.message || "error"}`,
            true,
        );
    }
}

function renderGitHubLogin(modalEl, repoContext, fixResult) {
    const actions = modalEl.querySelector("#heroAiActions");
    if (!actions) return;

    const existing = modalEl.querySelector("#heroAiLoginPanel");
    if (existing) return;

    const panel = document.createElement("div");
    panel.id = "heroAiLoginPanel";
    panel.className = "hero-ai-login";
    panel.innerHTML = `
        <p class="hero-ai-login__title">🔗 Login with GitHub</p>
        <p class="hero-ai-login__hint">A personal access token with <code>repo</code> scope is required to commit or open pull requests. Your token stays in this browser session only.</p>
        <input type="password" class="hero-ai-login__input" id="heroAiTokenInput" placeholder="ghp_… or github_pat_…" autocomplete="off" />
        <button type="button" class="hero-ai-btn hero-ai-btn--primary" id="heroAiLoginBtn">Connect GitHub</button>
        <p class="hero-ai-login__link">
            <a href="https://github.com/settings/tokens/new?scopes=repo&description=GitHubCity" target="_blank" rel="noopener">Create a token on GitHub</a>
        </p>
    `;
    actions.parentElement?.insertBefore(panel, actions);

    panel
        .querySelector("#heroAiLoginBtn")
        ?.addEventListener("click", async () => {
            const token = panel.querySelector("#heroAiTokenInput")?.value || "";
            const user = await loginWithGitHubToken(token);
            if (!user) {
                showFeedback(
                    modalEl,
                    "Invalid token. Check scope and try again.",
                    true,
                );
                return;
            }
            panel.remove();
            showFeedback(modalEl, `Connected as @${user.login}`);
            revealGitHubActions(modalEl, repoContext, fixResult);
        });
}

async function handleGitHubAction(
    modalEl,
    issue,
    meta,
    repoContext,
    fixResult,
    createPr,
    onFinalizeRepair,
) {
    const feedback = modalEl.querySelector("#heroAiFeedback");
    const commitBtn = modalEl.querySelector("#heroAiCommit");
    const prBtn = modalEl.querySelector("#heroAiCreatePr");

    commitBtn?.setAttribute("disabled", "true");
    prBtn?.setAttribute("disabled", "true");

    if (feedback) {
        feedback.classList.remove("hidden", "hero-ai-feedback--error");
        feedback.textContent = createPr
            ? "Creating branch, committing, and opening pull request…"
            : "Creating branch and committing fix…";
    }

    try {
        if (!fixResult.canAutoFix) {
            throw new Error(
                "AI fix did not modify the file content. Commit and pull request are blocked until the file has real changes.",
            );
        }

        const upstreamOwner = repoContext.owner;
        const upstreamRepo = repoContext.repo;
        const baseBranch = repoContext.defaultBranch;
        const branchName = fixResult.branchName;

        const perms = await checkRepoPermissions(upstreamOwner, upstreamRepo);

        let commitOwner = upstreamOwner;
        let commitRepo = upstreamRepo;
        const prOwner = upstreamOwner;
        const prRepo = upstreamRepo;
        let prHead = branchName;

        if (!perms.hasWriteAccess && createPr) {
            const fork = await forkRepository(upstreamOwner, upstreamRepo);
            if (!fork) throw new Error("Could not fork repository.");
            commitOwner = fork.forkOwner;
            commitRepo = fork.forkRepo;
            prHead = `${fork.forkOwner}:${branchName}`;
            await delay(2000);
        } else if (!perms.hasWriteAccess) {
            throw new Error(
                "No write access. Use Fork & Create Pull Request or copy the fix.",
            );
        }

        let fileSha = fixResult.fileSha;
        if (commitOwner !== upstreamOwner || commitRepo !== upstreamRepo) {
            const forkFile = await fetchRepoFileContent(
                commitOwner,
                commitRepo,
                fixResult.filePath,
                baseBranch,
            );
            fileSha = forkFile?.sha ?? null;
        }

        const result = await applyFixWorkflow({
            owner: commitOwner,
            repo: commitRepo,
            filePath: fixResult.filePath,
            originalContent: fixResult.originalContent,
            fixedContent: fixResult.fixedContent,
            fileSha,
            commitMessage: fixResult.commitMessage,
            branchName,
            baseBranch,
            createPr,
            prTitle: fixResult.prTitle,
            prDescription: fixResult.prDescription,
            prOwner,
            prRepo,
            prHead,
        });

        recordBranchFix(fixResult.filePath, result.branchName);
        renderCommitSuccess(
            modalEl,
            repoContext,
            fixResult,
            result,
            createPr,
            onFinalizeRepair,
        );
    } catch (err) {
        commitBtn?.removeAttribute("disabled");
        prBtn?.removeAttribute("disabled");
        showFeedback(modalEl, err?.message || "GitHub action failed.", true);
    }
}

// ─── Commit success phase (unchanged from original) ───────────────────────────

function renderCommitSuccess(
    modalEl,
    repoContext,
    fixResult,
    result,
    createdPr,
    onFinalizeRepair,
) {
    const panel = modalEl.querySelector(".hero-challenge-panel");
    if (!panel) return;

    const mergeHint = createdPr
        ? `<p class="hero-ai-success__hint">Merge the pull request into <strong>${escapeHtml(
              repoContext.defaultBranch || "main",
          )}</strong>, then reload the city to verify the fix on the default branch.</p>`
        : `<p class="hero-ai-success__hint">Reload the city to verify the fix from GitHub.</p>`;

    panel.innerHTML = `
        <div class="hero-ai-success">
            <div class="hero-ai-success__icon">✅</div>
            <h2 class="hero-ai-success__title">Fix Applied</h2>
            <p class="hero-ai-success__sub">Repository Updated</p>
            <div class="hero-ai-success__details">
                <div class="hero-ai-success__row">
                    <span>Repository</span>
                    <strong>${escapeHtml(repoContext.fullName)}</strong>
                </div>
                <div class="hero-ai-success__row">
                    <span>Branch</span>
                    <strong>${escapeHtml(result.branchName)}</strong>
                </div>
                <div class="hero-ai-success__row">
                    <span>Commit</span>
                    <strong>${escapeHtml(
                        result.commitSha?.slice(0, 7) || "—",
                    )}</strong>
                </div>
                ${
                    result.commitUrl
                        ? `<a class="hero-ai-success__link" href="${escapeHtml(
                              result.commitUrl,
                          )}" target="_blank" rel="noopener">View commit on GitHub</a>`
                        : ""
                }
                ${
                    createdPr && result.prUrl
                        ? `<a class="hero-ai-success__link" href="${escapeHtml(
                              result.prUrl,
                          )}" target="_blank" rel="noopener">View Pull Request</a>`
                        : ""
                }
            </div>
            ${mergeHint}
            <button type="button" class="hero-ai-btn hero-ai-btn--primary hero-ai-success__reload" id="heroAiReloadCity">Reload City</button>
            <p class="hero-ai-success__restoring">Restoring building and city health…</p>
        </div>
    `;

    panel
        .querySelector("#heroAiReloadCity")
        ?.addEventListener("click", () => window.location.reload());

    setTimeout(() => {
        onFinalizeRepair({ ...fixResult, github: result });
    }, 1400);
}

// ─── Diff renderer (unchanged from original) ─────────────────────────────────

function renderDiffPanels(fixResult) {
    const oldLines = [];
    const newLines = [];

    for (const row of fixResult.diff) {
        const escaped = escapeHtml(row.content);
        if (row.type === "same") {
            oldLines.push(
                `<div class="hero-ai-diff__line"><span class="hero-ai-diff__num">${
                    row.oldLine ?? ""
                }</span><code>${escaped || " "}</code></div>`,
            );
            newLines.push(
                `<div class="hero-ai-diff__line"><span class="hero-ai-diff__num">${
                    row.newLine ?? ""
                }</span><code>${escaped || " "}</code></div>`,
            );
        } else if (row.type === "remove") {
            oldLines.push(
                `<div class="hero-ai-diff__line hero-ai-diff__line--remove"><span class="hero-ai-diff__num">${
                    row.oldLine ?? ""
                }</span><code>${escaped || " "}</code></div>`,
            );
            newLines.push(
                `<div class="hero-ai-diff__line hero-ai-diff__line--empty"><span class="hero-ai-diff__num"></span><code></code></div>`,
            );
        } else {
            oldLines.push(
                `<div class="hero-ai-diff__line hero-ai-diff__line--empty"><span class="hero-ai-diff__num"></span><code></code></div>`,
            );
            newLines.push(
                `<div class="hero-ai-diff__line hero-ai-diff__line--add"><span class="hero-ai-diff__num">${
                    row.newLine ?? ""
                }</span><code>${escaped || " "}</code></div>`,
            );
        }
    }

    return `
        <div class="hero-ai-diff__pane hero-ai-diff__pane--old">${oldLines.join(
            "",
        )}</div>
        <div class="hero-ai-diff__pane hero-ai-diff__pane--new">${newLines.join(
            "",
        )}</div>
    `;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function showFeedback(modalEl, message, isError = false) {
    const el = modalEl.querySelector("#heroAiFeedback");
    if (!el) return;
    el.classList.remove("hidden", "hero-ai-feedback--error");
    if (isError) el.classList.add("hero-ai-feedback--error");
    el.textContent = message;
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
