/**
 * Line diff utilities for code review UI.
 */

/**
 * @typedef {{ type: 'same' | 'add' | 'remove', content: string, oldLine?: number, newLine?: number }} DiffLine
 */

/**
 * @param {string} original
 * @param {string} fixed
 * @returns {DiffLine[]}
 */
export function buildLineDiff(original, fixed) {
    const oldLines = original.split("\n");
    const newLines = fixed.split("\n");
    const m = oldLines.length;
    const n = newLines.length;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] =
                oldLines[i] === newLines[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    /** @type {DiffLine[]} */
    const result = [];
    let i = 0;
    let j = 0;
    let oldLine = 1;
    let newLine = 1;

    while (i < m && j < n) {
        if (oldLines[i] === newLines[j]) {
            result.push({
                type: "same",
                content: oldLines[i],
                oldLine,
                newLine,
            });
            i++;
            j++;
            oldLine++;
            newLine++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            result.push({
                type: "remove",
                content: oldLines[i],
                oldLine,
            });
            i++;
            oldLine++;
        } else {
            result.push({
                type: "add",
                content: newLines[j],
                newLine,
            });
            j++;
            newLine++;
        }
    }

    while (i < m) {
        result.push({ type: "remove", content: oldLines[i], oldLine });
        i++;
        oldLine++;
    }
    while (j < n) {
        result.push({ type: "add", content: newLines[j], newLine });
        j++;
        newLine++;
    }

    return result;
}

/**
 * @param {DiffLine[]} diff
 * @returns {string}
 */
export function diffToPatch(diff, filePath) {
    const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
    for (const row of diff) {
        if (row.type === "same") lines.push(` ${row.content}`);
        else if (row.type === "remove") lines.push(`-${row.content}`);
        else lines.push(`+${row.content}`);
    }
    return lines.join("\n");
}
