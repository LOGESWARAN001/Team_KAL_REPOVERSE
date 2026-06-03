/**
 * Generates interactive mission challenges from issue context.
 */

const CHALLENGE_TYPES = ["quiz", "bugHunter", "matchFix", "codeDetective"];

function pickType() {
    return CHALLENGE_TYPES[Math.floor(Math.random() * CHALLENGE_TYPES.length)];
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildFireQuiz(issue) {
    const f = issue.detail;
    const correct = "Check failing test cases and workflow logs";
    const options = shuffle([
        correct,
        "Change the repository logo",
        "Edit the README only",
        "Rename the repository",
    ]);
    return {
        type: "quiz",
        typeLabel: "Multiple Choice Quiz",
        question: `Build failed at "${f.failedStep}". What is the best first investigation step?`,
        options,
        correctAnswer: correct,
        successFeedback:
            "Correct! Failed CI runs should always be diagnosed from logs and test output first.",
        failFeedback:
            "Not quite — start by reading the workflow logs and identifying which step failed.",
    };
}

function buildFireBugHunter(issue) {
    const f = issue.detail;
    const correct = f.failedStep?.includes("test")
        ? "Test suite"
        : f.workflowName?.toLowerCase().includes("deploy")
        ? "Deployment pipeline"
        : "CI workflow configuration";
    const options = shuffle([
        correct,
        "Marketing website",
        "Desktop wallpaper assets",
        "Social media links",
    ]);
    return {
        type: "bugHunter",
        typeLabel: "Bug Hunter",
        hints: [
            `Failure reason: ${f.reason}`,
            `Workflow: ${f.workflowName}`,
            `Branch affected: ${f.branch || "main"}`,
        ],
        question:
            "Based on the clues, which area should you investigate first?",
        options,
        correctAnswer: correct,
        successFeedback:
            "Sharp detective work! You traced the failure to the right subsystem.",
        failFeedback:
            "Look again at the workflow name and failed step — they point to the CI pipeline.",
    };
}

function buildFireMatchFix(issue) {
    const correct = "Re-run tests locally and fix the failing step";
    const options = shuffle([
        correct,
        "Delete the repository",
        "Ignore all warnings permanently",
        "Disable every GitHub Action",
    ]);
    return {
        type: "matchFix",
        typeLabel: "Match the Fix",
        question: `Issue: ${issue.title}. Which fix best restores a healthy build?`,
        options,
        correctAnswer: correct,
        successFeedback: "That's the fix a senior engineer would apply first!",
        failFeedback:
            "The sustainable fix is to reproduce the failure locally and patch the root cause.",
    };
}

function buildFireDetective(issue) {
    const f = issue.detail;
    const correct = "Tests or build steps did not pass in CI";
    const options = shuffle([
        correct,
        "The city weather system changed",
        "Too many stars in the sky",
        "Buildings were painted the wrong color",
    ]);
    return {
        type: "codeDetective",
        typeLabel: "Code Detective",
        scenario: `Deployment pipeline "${f.workflowName}" failed during "${f.failedStep}".`,
        question: "What most likely caused this build failure?",
        options,
        correctAnswer: correct,
        successFeedback:
            "Case closed! CI failures almost always trace back to tests, lint, or build steps.",
        failFeedback:
            "Review the failed step — builds fail when automated checks don't pass.",
    };
}

function buildSecurityQuiz(issue) {
    const correct = "Update the vulnerable dependency and rotate secrets";
    const options = shuffle([
        correct,
        "Commit API keys to README",
        "Disable HTTPS everywhere",
        "Share passwords in chat",
    ]);
    return {
        type: "quiz",
        typeLabel: "Security Quiz",
        question:
            "A security vulnerability was detected. What is the correct response?",
        options,
        correctAnswer: correct,
        successFeedback:
            "Excellent! Patch dependencies and protect credentials.",
        failFeedback:
            "Security issues require patching packages and securing secrets — never ignoring them.",
    };
}

function buildBugQuiz(issue) {
    const correct = "Write a regression test and fix the root cause";
    const options = shuffle([
        correct,
        "Hide the error message",
        "Delete the affected file",
        "Comment out all logic",
    ]);
    return {
        type: "quiz",
        typeLabel: "Bug Hunt Quiz",
        question: `Bug found in ${issue.fileName}. What's the professional fix?`,
        options,
        correctAnswer: correct,
        successFeedback:
            "Perfect! Tests plus a targeted fix keeps the city safe.",
        failFeedback:
            "Bugs should be fixed properly with tests — not hidden or deleted.",
    };
}

function buildComplexityQuiz(issue) {
    const correct = "Refactor into smaller, focused modules";
    const options = shuffle([
        correct,
        "Add 500 more lines to the same file",
        "Copy-paste duplicate logic",
        "Remove all comments and hope",
    ]);
    return {
        type: "codeDetective",
        typeLabel: "Complexity Challenge",
        scenario: `${issue.fileName} has high complexity and is hard to maintain.`,
        question: "What reduces complexity and saves this building?",
        options,
        correctAnswer: correct,
        successFeedback: "Modular code saves cities — and codebases!",
        failFeedback:
            "Splitting large files into focused modules is the proven approach.",
    };
}

export function createMissionChallenge(issue) {
    if (!issue) return null;

    const type = pickType();

    if (issue.category === "fire") {
        if (type === "quiz") return buildFireQuiz(issue);
        if (type === "bugHunter") return buildFireBugHunter(issue);
        if (type === "matchFix") return buildFireMatchFix(issue);
        return buildFireDetective(issue);
    }

    if (issue.category === "security") {
        return type === "bugHunter"
            ? {
                  ...buildSecurityQuiz(issue),
                  type: "bugHunter",
                  typeLabel: "Security Hunter",
                  hints: [
                      "Unauthorized access attempt detected",
                      "Sensitive module flagged",
                      "Dependency audit reported a CVE",
                  ],
              }
            : buildSecurityQuiz(issue);
    }

    if (issue.category === "complexity") {
        return buildComplexityQuiz(issue);
    }

    if (type === "bugHunter") {
        return {
            type: "bugHunter",
            typeLabel: "Bug Hunter",
            hints: [
                "Issue linked to this source file",
                `Severity: ${issue.severity}`,
                issue.description,
            ],
            question: "Which action should a City Hero take first?",
            options: shuffle([
                "Inspect this file and related tests",
                "Ignore the warning",
                "Rename unrelated files",
                "Delete the git history",
            ]),
            correctAnswer: "Inspect this file and related tests",
            successFeedback: "You found the right trail!",
            failFeedback: "Start with the affected file and its tests.",
        };
    }

    return buildBugQuiz(issue);
}

export function buildAiRecommendation(issue) {
    return {
        explanation: issue.description,
        solution:
            issue.suggestedFix ||
            "Review the affected file, add tests, and verify the fix in CI.",
        file: issue.filePath,
        severityImpact:
            issue.severity === "critical"
                ? "Critical — city district at risk"
                : issue.severity === "high"
                ? "High — building stability reduced"
                : issue.severity === "medium"
                ? "Medium — monitor closely"
                : "Minor — quick win available",
    };
}
