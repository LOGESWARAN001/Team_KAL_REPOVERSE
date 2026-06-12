/**
 * GitHub write operations — branch, commit, pull request (user-initiated only).
 */

import { fixContentChanged } from "./aiFixService.js";
import { githubFetch } from "./api.js";
import { fetchRepoFileContent } from "./repoFileContent.js";

function encodeFilePath(filePath) {
    return filePath
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}

function toBase64(content) {
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

export function logFixCommit(stage, details = {}) {
    console.group(`[RepoVerse Fix] ${stage}`);
    for (const [key, value] of Object.entries(details)) {
        console.log(`${key}:`, value);
    }
    console.groupEnd();
}

/**
 * @param {{
 *   filePath: string,
 *   originalContent?: string,
 *   fixedContent: string,
 *   fileSha?: string | null,
 * }} payload
 */
export function validateFixPayload(payload) {
    const { filePath, originalContent = "", fixedContent, fileSha } = payload;

    if (!filePath?.trim()) {
        throw new Error("Missing target file path — cannot commit.");
    }
    if (!fixedContent?.length) {
        throw new Error("Fixed file content is empty — cannot commit.");
    }
    if (!fixContentChanged(originalContent, fixedContent)) {
        throw new Error(
            "AI fix did not modify the file. No changes to commit or open in a pull request.",
        );
    }
    if (originalContent?.length && !fileSha) {
        throw new Error(
            "Missing original file SHA — GitHub requires SHA when updating an existing file.",
        );
    }
}

export async function getBranchHeadSha(owner, repo, branchName) {
    const ref = await githubFetch(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(
            branchName,
        )}`,
    );
    return ref?.object?.sha || null;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} branchName
 * @param {string} baseBranch
 */
export async function createBranch(owner, repo, branchName, baseBranch) {
    const ref = await githubFetch(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(
            baseBranch,
        )}`,
    );
    const baseSha = ref?.object?.sha;
    if (!baseSha) {
        throw new Error(`Could not resolve base branch "${baseBranch}".`);
    }

    try {
        await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
            method: "POST",
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: baseSha,
            }),
        });
        logFixCommit("Branch Created", {
            "Target Branch": branchName,
            "Branch SHA": baseSha,
            "Base Branch": baseBranch,
        });
    } catch (err) {
        if (err.status !== 422) throw err;
        await githubFetch(
            `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(
                branchName,
            )}`,
            {
                method: "PATCH",
                body: JSON.stringify({ sha: baseSha, force: true }),
            },
        );
        logFixCommit("Branch Reset", {
            "Target Branch": branchName,
            "Branch SHA": baseSha,
            "Base Branch": baseBranch,
            Note: "Existing branch reset to base before applying fix",
        });
    }

    return baseSha;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} content
 * @param {string} message
 * @param {string} branch
 * @param {string | null} fileSha
 */
export async function commitFileChange(
    owner,
    repo,
    filePath,
    content,
    message,
    branch,
    fileSha = null,
) {
    const encodedPath = encodeFilePath(filePath);
    const payload = {
        message,
        content: toBase64(content),
        branch,
    };
    if (fileSha) payload.sha = fileSha;

    logFixCommit("Commit Request", {
        "Target File Path": filePath,
        "Original File SHA": fileSha || "(new file)",
        "Updated Content Length": content.length,
        Branch: branch,
        "Commit Message": message,
    });

    const result = await githubFetch(
        `/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
            method: "PUT",
            body: JSON.stringify(payload),
        },
    );

    const commitSha = result?.commit?.sha || null;
    const updatedFileSha = result?.content?.sha || null;

    logFixCommit("Commit Response", {
        "Target File Path": filePath,
        "Updated File SHA": updatedFileSha || "—",
        "Commit SHA": commitSha || "—",
        "Branch SHA": result?.commit?.tree?.sha || "—",
    });

    if (!commitSha) {
        throw new Error(
            "GitHub did not return a commit SHA for the file update.",
        );
    }

    return {
        commitSha,
        commitUrl: result?.commit?.html_url || null,
        updatedFileSha,
    };
}

export async function compareBranches(owner, repo, baseBranch, headBranch) {
    const headRef = headBranch.includes(":")
        ? headBranch
        : encodeURIComponent(headBranch);
    const comparison = await githubFetch(
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(
            baseBranch,
        )}...${headRef}`,
    );

    return {
        status: comparison.status,
        aheadBy: comparison.ahead_by ?? 0,
        behindBy: comparison.behind_by ?? 0,
        files: comparison.files || [],
        totalCommits: comparison.total_commits ?? 0,
        headSha:
            comparison.commits?.[comparison.commits.length - 1]?.sha || null,
    };
}

/**
 * Ensure the fix branch actually differs from the base branch before opening a PR.
 */
export async function verifyBranchHasFileChanges(
    owner,
    repo,
    baseBranch,
    headBranch,
    filePath,
) {
    const comparison = await compareBranches(
        owner,
        repo,
        baseBranch,
        headBranch,
    );

    logFixCommit("Branch Compare", {
        "Base Branch": baseBranch,
        "Head Branch": headBranch,
        Status: comparison.status,
        "Commits Ahead": comparison.aheadBy,
        "Files Changed": comparison.files.length,
        "Target File Path": filePath,
        "Commit SHA": comparison.headSha || "—",
    });

    if (comparison.status === "identical" || comparison.aheadBy < 1) {
        throw new Error(
            "Branch has no commits ahead of the base branch. Pull request would contain zero changes.",
        );
    }

    if (!comparison.files.length) {
        throw new Error(
            "GitHub reports zero changed files on the fix branch. Pull request creation blocked.",
        );
    }

    const normalizedPath = filePath.replace(/\\/g, "/");
    const touched = comparison.files.some(
        (file) => file.filename === normalizedPath,
    );
    if (!touched) {
        throw new Error(
            `Commit succeeded but "${filePath}" is not listed among changed files. Pull request creation blocked.`,
        );
    }

    return comparison;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} title
 * @param {string} head Branch name (or forkOwner:branch)
 * @param {string} base
 * @param {string} body
 */
export async function createPullRequest(owner, repo, title, head, base, body) {
    const pr = await githubFetch(`/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({ title, head, base, body }),
    });

    logFixCommit("Pull Request Created", {
        "PR Number": pr.number,
        "PR URL": pr.html_url,
        Head: head,
        Base: base,
        "Changed Files (reported)": pr.changed_files ?? "—",
    });

    return {
        prUrl: pr.html_url,
        prNumber: pr.number,
        prTitle: pr.title,
        changedFiles: pr.changed_files ?? null,
    };
}

/**
 * Apply fix, commit, and optionally open a PR on a new branch.
 */
export async function applyFixWorkflow({
    owner,
    repo,
    filePath,
    originalContent = "",
    fixedContent,
    fileSha,
    commitMessage,
    branchName,
    baseBranch,
    createPr = false,
    prTitle,
    prDescription,
    prOwner = owner,
    prRepo = repo,
    prHead = branchName,
}) {
    logFixCommit("Workflow Start", {
        Repository: `${owner}/${repo}`,
        "PR Repository": `${prOwner}/${prRepo}`,
        "Target File Path": filePath,
        "Original File SHA": fileSha || "—",
        "Original Content Length": originalContent.length,
        "Updated Content Length": fixedContent.length,
        "Base Branch": baseBranch,
        "Target Branch": branchName,
        "PR Head": prHead,
    });

    validateFixPayload({
        filePath,
        originalContent,
        fixedContent,
        fileSha,
    });

    const baseSha = await createBranch(owner, repo, branchName, baseBranch);

    let branchFileSha = fileSha;
    const branchFile = await fetchRepoFileContent(
        owner,
        repo,
        filePath,
        branchName,
    );
    if (branchFile?.sha) {
        branchFileSha = branchFile.sha;
    }

    logFixCommit("Branch File Resolved", {
        "Target File Path": filePath,
        "Original File SHA": branchFileSha || "—",
        "Original Content Length":
            branchFile?.content?.length ?? originalContent.length,
        "Branch SHA (before commit)":
            (await getBranchHeadSha(owner, repo, branchName)) || baseSha,
    });

    const commit = await commitFileChange(
        owner,
        repo,
        filePath,
        fixedContent,
        commitMessage,
        branchName,
        branchFileSha,
    );

    const branchShaAfter = await getBranchHeadSha(owner, repo, branchName);

    logFixCommit("Post-Commit Verification", {
        "Target File Path": filePath,
        "Updated File SHA": commit.updatedFileSha || "—",
        "Commit SHA": commit.commitSha,
        "Branch SHA": branchShaAfter || "—",
    });

    const comparison = await verifyBranchHasFileChanges(
        prOwner,
        prRepo,
        baseBranch,
        prHead,
        filePath,
    );

    let pr = null;
    if (createPr) {
        pr = await createPullRequest(
            prOwner,
            prRepo,
            prTitle || commitMessage,
            prHead,
            baseBranch,
            prDescription || commitMessage,
        );

        if (pr.changedFiles === 0) {
            throw new Error(
                "Pull request was created but GitHub reports zero changed files. Please verify the commit on GitHub.",
            );
        }
    }

    return {
        branchName,
        branchSha: branchShaAfter,
        commitSha: commit.commitSha,
        commitUrl: commit.commitUrl,
        updatedFileSha: commit.updatedFileSha,
        filesChanged: comparison.files.length,
        prUrl: pr?.prUrl || null,
        prNumber: pr?.prNumber || null,
    };
}
