/**
 * Maps repository files to the contribution-style 2D grid.
 */

import { normalizeRepoPath } from "./buildingIndex.js";

const SKIP_PATH_SEGMENTS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "vendor",
    "coverage",
    ".next",
    "__pycache__",
    ".husky",
]);

const MAX_FILES = 400;
const MAX_GRID_WIDTH = 53;

const LANGUAGE_BY_EXT = {
    js: "JavaScript",
    mjs: "JavaScript",
    cjs: "JavaScript",
    jsx: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    java: "Java",
    kt: "Kotlin",
    swift: "Swift",
    cs: "C#",
    cpp: "C++",
    c: "C",
    h: "C/C++ Header",
    hpp: "C++ Header",
    css: "CSS",
    scss: "SCSS",
    sass: "Sass",
    less: "Less",
    html: "HTML",
    htm: "HTML",
    vue: "Vue",
    svelte: "Svelte",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    sql: "SQL",
    sh: "Shell",
    bash: "Shell",
    ps1: "PowerShell",
    php: "PHP",
    dart: "Dart",
    lua: "Lua",
    r: "R",
    scala: "Scala",
    ex: "Elixir",
    exs: "Elixir",
    xml: "XML",
    svg: "SVG",
    glsl: "GLSL",
};

export function estimateLinesFromSize(size) {
    return Math.max(1, Math.round(size / 50));
}

export function metricToBuildingHeight(lines) {
    if (lines <= 50) return Math.max(1, Math.ceil(lines / 25));
    if (lines <= 200) return Math.min(5, 2 + Math.floor((lines - 51) / 50));
    if (lines <= 500) return Math.min(10, 6 + Math.floor((lines - 201) / 100));
    if (lines <= 1500)
        return Math.min(20, 11 + Math.floor((lines - 501) / 200));
    return Math.min(35, 21 + Math.floor((lines - 1501) / 500));
}

export function getLanguageFromFileName(name) {
    const parts = name.split(".");
    if (parts.length < 2) return "Other";
    const ext = parts.pop().toLowerCase();
    return LANGUAGE_BY_EXT[ext] || ext.toUpperCase();
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isWorkflowPath(path) {
    return /^\.github\/workflows\/.+\.(ya?ml)$/i.test(path);
}

function shouldSkipPath(path) {
    if (isWorkflowPath(path)) return false;
    const segments = path.split("/");
    return segments.some(
        (seg) =>
            SKIP_PATH_SEGMENTS.has(seg) ||
            (seg.startsWith(".") && seg !== "." && seg !== ".."),
    );
}

function getFolderPath(filePath) {
    const idx = filePath.lastIndexOf("/");
    return idx === -1 ? "/" : filePath.slice(0, idx);
}

function getFileName(filePath) {
    const idx = filePath.lastIndexOf("/");
    return idx === -1 ? filePath : filePath.slice(idx + 1);
}

function createEmptyGrid(rows, cols, fill = -1) {
    const grid = [];
    const heights = [];
    const meta = [];
    for (let i = 0; i < rows; i++) {
        grid.push(new Array(cols).fill(fill));
        heights.push(new Array(cols).fill(0));
        meta.push(new Array(cols).fill(null));
    }
    return { grid, heights, meta };
}

function placeBlock(
    gridData,
    startY,
    startX,
    block,
    fileIdStart,
    buildingIdByPath,
) {
    const { grid, heights, meta } = gridData;
    let fileId = fileIdStart;
    const { files, cols, rows } = block;

    for (let r = 0; r < rows + 2; r++) {
        for (let c = 0; c < cols + 2; c++) {
            const y = startY + r;
            const x = startX + c;
            if (r === 0 || c === 0 || r === rows + 1 || c === cols + 1) {
                if (grid[y][x] === -1) grid[y][x] = 0;
                continue;
            }
            const fileIndex = (r - 1) * cols + (c - 1);
            if (fileIndex >= files.length) {
                if (grid[y][x] === -1) grid[y][x] = 0;
                continue;
            }
            const file = files[fileIndex];
            const filePath = normalizeRepoPath(file.path);
            const lines = file.lines ?? estimateLinesFromSize(file.size);
            const height = metricToBuildingHeight(lines);
            const buildingId = `b-${fileId}`;
            grid[y][x] = fileId;
            heights[y][x] = height;
            buildingIdByPath.set(filePath, buildingId);
            meta[y][x] = {
                buildingId,
                fileName: file.name,
                filePath,
                folderName: file.folder,
                folderPath: file.folder,
                path: filePath,
                lines,
                size: file.size,
                sizeFormatted: formatFileSize(file.size),
                language: file.language,
            };
            fileId++;
        }
    }
    return fileId;
}

export function buildRepositoryGrid(treeFiles) {
    const files = [];
    for (const entry of treeFiles) {
        if (entry.type !== "blob") continue;
        if (shouldSkipPath(entry.path)) continue;
        const name = getFileName(entry.path);
        if (!name) continue;
        if (name.startsWith(".") && !isWorkflowPath(entry.path)) continue;
        const folder = getFolderPath(entry.path);
        const lines = estimateLinesFromSize(entry.size || 0);
        files.push({
            path: entry.path,
            name,
            folder,
            size: entry.size || 0,
            lines,
            language: getLanguageFromFileName(name),
        });
    }

    files.sort((a, b) => {
        if (a.folder !== b.folder) return a.folder.localeCompare(b.folder);
        return a.path.localeCompare(b.path);
    });

    const truncated = files.length > MAX_FILES;
    const workflowFiles = files.filter((f) => isWorkflowPath(f.path));
    const otherFiles = files.filter((f) => !isWorkflowPath(f.path));
    const roomForOthers = Math.max(0, MAX_FILES - workflowFiles.length);
    const limitedFiles = [
        ...workflowFiles,
        ...otherFiles.slice(0, roomForOthers),
    ];

    const folderMap = new Map();
    for (const file of limitedFiles) {
        if (!folderMap.has(file.folder)) folderMap.set(file.folder, []);
        folderMap.get(file.folder).push(file);
    }

    const blocks = [...folderMap.keys()].sort().map((folder) => {
        const folderFiles = folderMap.get(folder);
        const cols = Math.max(1, Math.ceil(Math.sqrt(folderFiles.length)));
        const rows = Math.ceil(folderFiles.length / cols);
        return { folder, files: folderFiles, cols, rows };
    });

    const packedRows = [];
    let currentPack = [];
    let currentWidth = 0;
    let currentHeight = 0;

    for (const block of blocks) {
        const packWidth = block.cols + 2;
        const packHeight = block.rows + 2;
        if (
            currentPack.length > 0 &&
            currentWidth + packWidth + 1 > MAX_GRID_WIDTH
        ) {
            packedRows.push({
                blocks: currentPack,
                width: currentWidth,
                height: currentHeight,
            });
            currentPack = [];
            currentWidth = 0;
            currentHeight = 0;
        }
        currentPack.push({ ...block, packWidth, packHeight });
        currentWidth += packWidth + (currentPack.length > 1 ? 1 : 0);
        currentHeight = Math.max(currentHeight, packHeight);
    }
    if (currentPack.length > 0) {
        packedRows.push({
            blocks: currentPack,
            width: currentWidth,
            height: currentHeight,
        });
    }

    const totalRows =
        packedRows.reduce((sum, row) => sum + row.height, 0) +
        Math.max(0, packedRows.length - 1) +
        2;
    const totalCols = MAX_GRID_WIDTH + 2;

    const gridData = createEmptyGrid(totalRows, totalCols);
    const buildingIdByPath = new Map();
    let fileId = 1;
    let y = 1;

    for (let rowIndex = 0; rowIndex < packedRows.length; rowIndex++) {
        const packRow = packedRows[rowIndex];
        let x = 1;
        let rowMaxHeight = 0;
        for (const block of packRow.blocks) {
            fileId = placeBlock(
                gridData,
                y,
                x,
                block,
                fileId,
                buildingIdByPath,
            );
            x += block.packWidth + 1;
            rowMaxHeight = Math.max(rowMaxHeight, block.packHeight);
        }
        y += rowMaxHeight;
        if (rowIndex < packedRows.length - 1) {
            for (let cx = 1; cx < totalCols - 1; cx++) {
                if (gridData.grid[y][cx] === -1) gridData.grid[y][cx] = 0;
            }
            y++;
        }
    }

    const languages = {};
    for (const file of limitedFiles) {
        languages[file.language] = (languages[file.language] || 0) + 1;
    }

    let largestFile = null;
    for (const file of limitedFiles) {
        if (!largestFile || file.size > largestFile.size) largestFile = file;
    }

    const stats = {
        totalFiles: limitedFiles.length,
        totalFolders: folderMap.size,
        linesOfCode: limitedFiles.reduce((sum, f) => sum + f.lines, 0),
        largestFile: largestFile
            ? {
                  name: largestFile.name,
                  path: largestFile.path,
                  size: largestFile.size,
                  sizeFormatted: formatFileSize(largestFile.size),
                  lines: largestFile.lines,
              }
            : null,
        languages: Object.entries(languages)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count })),
        truncated,
        totalFilesInRepo: files.length,
        owner: null,
        repo: null,
    };

    const explorerFiles = files.map((f) => {
        const path = normalizeRepoPath(f.path);
        return {
            path,
            name: f.name,
            folder: f.folder,
            folderName: f.folder,
            size: f.size,
            lines: f.lines,
            language: f.language,
            sizeFormatted: formatFileSize(f.size),
            buildingId: buildingIdByPath.get(path) || null,
        };
    });

    return {
        grid: gridData.grid,
        heightGrid: gridData.heights,
        fileMetaGrid: gridData.meta,
        explorerFiles,
        stats,
    };
}
