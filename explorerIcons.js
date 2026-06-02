/**
 * Inline SVG icons for Repository Explorer (no Font Awesome dependency).
 */

const FILE_COLORS = {
    ts: "#3178c6",
    tsx: "#3178c6",
    js: "#f0db4f",
    mjs: "#f0db4f",
    cjs: "#f0db4f",
    jsx: "#61dafb",
    json: "#cbcb41",
    css: "#563d7c",
    scss: "#c6538c",
    sass: "#c6538c",
    html: "#e44d26",
    htm: "#e44d26",
    vue: "#41b883",
    md: "#8b8b9a",
    py: "#3572a5",
    go: "#00add8",
    rs: "#dea584",
    java: "#b07219",
    yml: "#cb171e",
    yaml: "#cb171e",
    svg: "#ffb13b",
    png: "#a074c4",
    jpg: "#a074c4",
    glb: "#8b8b9a",
    sql: "#e38c00",
    sh: "#89e051",
};

export function svgFolder() {
    return `<svg class="repo-svg repo-svg-folder" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.2l1.3 1.3h6.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8.3z"/></svg>`;
}

export function svgFile(fileName) {
    const ext = fileName.includes(".")
        ? fileName.split(".").pop().toLowerCase()
        : "";
    const color = FILE_COLORS[ext] || "#6eb6ff";
    return `<svg class="repo-svg repo-svg-file" viewBox="0 0 16 16" aria-hidden="true" style="--file-accent:${color}"><path fill="#4a4a54" d="M4 1.5h5.2L12 4.3v9.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path fill="${color}" d="M9 1.5v2.8h2.8L9 1.5z"/><rect fill="${color}" x="5" y="7" width="6" height="1.2" rx=".3" opacity=".9"/></svg>`;
}

export function svgChevron(collapsed) {
    if (collapsed) {
        return `<svg class="repo-svg repo-svg-chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 4.4a.75.75 0 0 1 1.06 0L10.9 8l-3.64 3.6a.75.75 0 1 1-1.06-1.06L8.94 8 6.2 5.46a.75.75 0 0 1 0-1.06z"/></svg>`;
    }
    return `<svg class="repo-svg repo-svg-chevron repo-svg-chevron--open" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.4 6.2a.75.75 0 0 1 1.06 0L8 8.74l2.54-2.54a.75.75 0 1 1 1.06 1.06L8.53 10.1a.75.75 0 0 1-1.06 0L4.4 7.26a.75.75 0 0 1 0-1.06z"/></svg>`;
}

export function svgStats() {
    return `<svg class="repo-svg repo-svg-stats" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M3 15.5V17h2v-1.5H3zm4 0V17h2v-1.5H7zm4 0V17h2v-1.5h-2zm4 0V17h2v-1.5h-2zM3 10.5V12h2v-1.5H3zm4 0V12h2v-1.5H7zm4 0V12h2v-1.5h-2zm4 0V12h2v-1.5h-2zM3 5.5V7h2V5.5H3zm4 0V7h2V5.5H7zm4 0V7h2V5.5h-2zm4 0V7h2V5.5h-2z" opacity=".9"/></svg>`;
}

export function svgToggleExplorer() {
    return `<svg class="repo-svg repo-svg-toggle" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M3 4.5a1 1 0 0 1 1-1h3.1l1.2 1.2H15a1 1 0 0 1 1 1v2.2H3V4.5zm0 5.2h13V12a1 1 0 0 1-1 1H7.3L6 15.5H4a1 1 0 0 1-1-1v-5.8zm2.5-2.4h2.2v1.4H5.5V7.3zm0 3.8h2.2v1.4H5.5v-1.4z" opacity=".95"/><path fill="currentColor" d="M11.2 7.8h4.8v1.5h-4.8V7.8zm0 3.2h4.8v1.5h-4.8v-1.5z"/></svg>`;
}

export function svgClose() {
    return `<svg class="repo-svg repo-svg-close" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.3 4.3a.8.8 0 0 1 1.1 0L8 6.9l2.6-2.6a.8.8 0 1 1 1.1 1.1L9.1 8l2.6 2.6a.8.8 0 0 1-1.1 1.1L8 9.1l-2.6 2.6a.8.8 0 1 1-1.1-1.1L6.9 8 4.3 5.4a.8.8 0 0 1 0-1.1z"/></svg>`;
}

export function svgSearch() {
    return `<svg class="repo-svg repo-svg-search" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 1.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8zm4.9 7.5a.8.8 0 0 1 1.1 0l1.5 1.5a.8.8 0 0 1-1.1 1.1l-1.5-1.5a.8.8 0 0 1 0-1.1z"/></svg>`;
}

export function folderChevronHtml(collapsed) {
    return `<span class="repo-tree-chevron">${svgChevron(collapsed)}</span>`;
}

export function folderIconHtml() {
    return `<span class="repo-tree-icon repo-tree-icon--folder">${svgFolder()}</span>`;
}

export function fileIconHtml(fileName) {
    return `<span class="repo-tree-icon repo-tree-icon--file">${svgFile(
        fileName,
    )}</span>`;
}
