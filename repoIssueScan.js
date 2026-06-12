/**
 * repoIssueScan.js
 * Scans all repo files using Azure OpenAI and maps issues to buildings.
 * Issues feed directly into buildingIndex → buildingIssueEffects → fire on rooftop.
 */

import {
    buildBuildingIndex,
    resolveBuildingIdByPath,
    normalizeRepoPath,
} from "./buildingIndex.js";
import { fetchRepoFileContent } from "./repoFileContent.js";

// ─── Azure OpenAI Config (same as heroAiRemediation.js) ───────────────────────
const AZURE_OPENAI_ENDPOINT =
    "https://trucsopenai.openai.azure.com/openai/v1/chat/completions";
const AZURE_OPENAI_API_KEY =
    "6dqaT4slEcJQ8nPKYenaWqLFPINX4DuhjGb7clbV06OBmbRjkoXwJQQJ99CFACYeBjFXJ3w3AAABACOGAbma";
const AZURE_OPENAI_DEPLOYMENT = "gpt-4.1-mini";

// ─── File extensions worth scanning ──────────────────────────────────────────
const SCANNABLE_EXTENSIONS = [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".css",
    ".scss",
    ".sass",
    ".html",
    ".json",
    ".py",
    ".java",
    ".go",
    ".rb",
    ".php",
];

// ─── Severity → fire intensity mapping (used by buildingIssueEffects.js) ─────
export const SEVERITY_FIRE_LEVEL = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
};

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Scans all files in the repo, detects issues via Azure OpenAI,
 * and returns enriched fileMetaGrid rows ready for buildBuildingIndex().
 *
 * @param {object}   repoContext  - { owner, repo, defaultBranch }
 * @param {Array}    explorerFiles - flat file list from repositoryExplorer.js
 * @param {function} onProgress   - optional callback(scannedCount, totalCount, currentFile)
 * @returns {Promise<Array>} scanResults — array of enriched file meta objects
 */
export async function scanRepoIssuesWithAzure(
    repoContext,
    explorerFiles,
    onProgress,
) {
    const scannable = (explorerFiles || []).filter((f) =>
        isScannableFile(f.path),
    );
    const total = scannable.length;
    const results = [];

    for (let i = 0; i < scannable.length; i++) {
        const file = scannable[i];
        const filePath = normalizeRepoPath(file.path);

        if (onProgress) onProgress(i, total, filePath);

        try {
            const fileContent = await fetchFileContent(repoContext, filePath);
            if (!fileContent || fileContent.trim().length === 0) {
                results.push(buildHealthyMeta(file, filePath));
                continue;
            }

            const scanResult = await scanFileWithAzure(
                repoContext,
                filePath,
                fileContent,
            );
            results.push(buildFileMeta(file, filePath, scanResult));
        } catch (err) {
            console.warn(
                `[IssueScan] Failed to scan ${filePath}:`,
                err.message,
            );
            results.push(buildHealthyMeta(file, filePath));
        }
    }

    if (onProgress) onProgress(total, total, null);
    return results;
}

// ─── Azure OpenAI scan for a single file ─────────────────────────────────────

async function scanFileWithAzure(repoContext, filePath, fileContent) {
    const fileName = filePath.split("/").pop();
    const fullFilePath = `https://github.com/${repoContext.owner}/${repoContext.repo}/blob/${repoContext.defaultBranch}/${filePath}`;

    const systemPrompt = `You are a senior software engineer performing a code review.
Analyse the given file for bugs, syntax errors, security vulnerabilities, performance issues, and bad practices.
Always respond with valid JSON only — no markdown fences, no extra text.`;

    const userPrompt = `Analyse this file and return a JSON object describing any issues found.

## File Info
- Name: ${fileName}
- Path: ${fullFilePath}

## File Content
\`\`\`
${fileContent}
\`\`\`

## Required JSON Response Shape
{
  "healthy": true | false,
  "summary": "<one sentence about the file health>",
  "issues": [
    {
      "issueType":    "<syntax | security | performance | bad-practice | logic | unused-code>",
      "severity":     "<critical | high | medium | low | info>",
      "line":         <line number as integer, or null>,
      "rootCause":    "<concise root cause in 1-2 sentences>",
      "explanation":  "<developer-friendly explanation>",
      "suggestedFix": "<what to change to fix it>"
    }
  ]
}

Rules:
- If no real issues exist, set "healthy": true and "issues": [].
- Only report genuine problems, not style preferences.
- "severity" must be exactly one of: critical, high, medium, low, info.
- Sort issues from highest to lowest severity.`;

    const response = await fetch(AZURE_OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: AZURE_OPENAI_DEPLOYMENT,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.1, // low temp = consistent, deterministic analysis
            max_tokens: 2048,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`Azure OpenAI error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Azure OpenAI returned empty response.");

    return parseAzureResponse(raw);
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseAzureResponse(rawText) {
    try {
        const clean = rawText.replace(/```(?:json)?\s*/gi, "").trim();
        return JSON.parse(clean);
    } catch {
        // Try extracting JSON object from anywhere in the response
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                /* fall through */
            }
        }
        // Return safe fallback so scan doesn't crash
        return {
            healthy: true,
            summary: "Could not parse AI response.",
            issues: [],
        };
    }
}

// ─── Meta builders ────────────────────────────────────────────────────────────

/**
 * Builds the enriched meta object from scan result.
 * Shape must match what buildingIndex.js + buildingIssueEffects.js expect.
 */
function buildFileMeta(file, filePath, scanResult) {
    const issues = scanResult.issues || [];
    const primaryIssue = issues[0] || null;
    const hasBug = !scanResult.healthy && issues.length > 0;
    const severityLabel = primaryIssue?.severity || null;

    return {
        // ── Identity ──
        buildingId: file.buildingId,
        filePath,
        path: filePath,

        // ── Issue flags (read by buildingIssueEffects.js to trigger fire) ──
        hasBug,
        buildFailed: severityLabel === "critical",
        issueCount: issues.length,
        issues,
        primaryIssue,
        severityLabel,

        // ── Fire intensity (0-4, read by fireBuildings.js) ──
        fireLevel: hasBug ? SEVERITY_FIRE_LEVEL[severityLabel] ?? 1 : 0,

        // ── Display ──
        summary: scanResult.summary || null,
        healthy: scanResult.healthy ?? !hasBug,
    };
}

function buildHealthyMeta(file, filePath) {
    return {
        buildingId: file.buildingId,
        filePath,
        path: filePath,
        hasBug: false,
        buildFailed: false,
        issueCount: 0,
        issues: [],
        primaryIssue: null,
        severityLabel: null,
        fireLevel: 0,
        healthy: true,
        summary: "File is healthy.",
    };
}

// ─── File fetching ────────────────────────────────────────────────────────────

async function fetchFileContent(repoContext, filePath) {
    const fileData = await fetchRepoFileContent(
        repoContext.owner,
        repoContext.repo,
        filePath,
        repoContext.defaultBranch,
    );
    const raw = fileData?.content ?? "";
    // GitHub API returns base64 — decode it
    return raw.includes("base64") ? atob(raw.replace(/\s/g, "")) : raw;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isScannableFile(filePath) {
    if (!filePath) return false;
    const lower = filePath.toLowerCase();
    // Skip lockfiles, minified files, and node_modules
    if (lower.includes("node_modules")) return false;
    if (lower.includes(".min.")) return false;
    if (lower.endsWith("package-lock.json")) return false;
    if (lower.endsWith("yarn.lock")) return false;
    return SCANNABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
