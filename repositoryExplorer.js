/**
 * Collapsible Repository Explorer with virtualized tree view.
 */

import {
    fileIconHtml,
    folderChevronHtml,
    folderIconHtml,
    svgClose,
    svgSearch,
    svgToggleExplorer,
} from "./explorerIcons.js";

const ROW_HEIGHT = 28;
const BUFFER_ROWS = 8;

export class RepositoryExplorer {
    constructor(rootEl) {
        this.root = rootEl;
        this.toggleBtn = rootEl.querySelector("#repoExplorerToggle");
        this.panel = rootEl.querySelector("#repoExplorerPanel");
        this.closeBtn = rootEl.querySelector("#repoExplorerClose");
        this.searchInput = rootEl.querySelector("#repoExplorerSearch");
        this.treeWrap = rootEl.querySelector("#repoExplorerTreeWrap");
        this.spacer = rootEl.querySelector("#repoExplorerSpacer");
        this.itemsEl = rootEl.querySelector("#repoExplorerTreeItems");
        this.detailsEl = rootEl.querySelector("#repoExplorerDetails");
        const searchIconEl = rootEl.querySelector("#repoExplorerSearchIcon");

        this.toggleBtn.innerHTML = svgToggleExplorer();
        this.closeBtn.innerHTML = svgClose();
        if (searchIconEl) searchIconEl.innerHTML = svgSearch();

        this.files = [];
        this.repoName = "repository";
        this.treeRoot = null;
        this.flatRows = [];
        this.expandedPaths = new Set(["/"]);
        this.selectedBuildingId = null;
        this.searchQuery = "";
        this.onFileSelect = null;

        this.scrollRaf = null;
        this.renderRaf = null;

        this.toggleBtn.addEventListener("click", () => this.togglePanel());
        this.closeBtn.addEventListener("click", () => this.collapsePanel());
        this.searchInput.addEventListener("input", () => {
            this.searchQuery = this.searchInput.value.trim().toLowerCase();
            this.rebuildFlatRows();
            this.treeWrap.scrollTop = 0;
            this.scheduleRender();
        });
        this.treeWrap.addEventListener("scroll", () => this.scheduleRender());
        this.itemsEl.addEventListener("click", (e) => this.onTreeClick(e));
    }

    setOnFileSelect(callback) {
        this.onFileSelect = callback;
    }

    setFiles(explorerFiles, repoName = "repository") {
        this.files = explorerFiles || [];
        this.repoName = repoName;
        this.treeRoot = buildTreeFromFiles(this.files, repoName);
        this.expandedPaths = new Set(["/"]);
        this.selectedBuildingId = null;
        this.searchQuery = "";
        this.searchInput.value = "";
        this.clearFileDetails();
        this.rebuildFlatRows();
        this.root.classList.remove("hidden");
        this.scheduleRender();
    }

    showFileDetails(meta) {
        if (!this.detailsEl) return;
        if (!meta) {
            this.clearFileDetails();
            return;
        }
        const path = meta.filePath || meta.path || "—";
        const lines = meta.lines != null ? meta.lines.toLocaleString() : "—";
        const size = meta.sizeFormatted || "—";
        const language = meta.language || "—";
        this.detailsEl.innerHTML = `
            <p class="repo-explorer-details-title">${escapeHtml(meta.fileName)}</p>
            <div class="repo-explorer-details-row"><span>Path</span><span>${escapeHtml(path)}</span></div>
            <div class="repo-explorer-details-row"><span>Lines of Code</span><span>${lines}</span></div>
            <div class="repo-explorer-details-row"><span>File Size</span><span>${escapeHtml(size)}</span></div>
            <div class="repo-explorer-details-row"><span>Language</span><span>${escapeHtml(language)}</span></div>
        `;
    }

    clearFileDetails() {
        if (!this.detailsEl) return;
        this.detailsEl.innerHTML =
            '<p class="repo-explorer-details-empty">Select a file to view details</p>';
    }

    hide() {
        this.root.classList.add("hidden");
        this.root.classList.remove("repo-explorer--open");
        this.collapsePanel();
        this.files = [];
        this.flatRows = [];
    }

    togglePanel() {
        const isOpen = this.panel.classList.toggle("open");
        this.root.classList.toggle("repo-explorer--open", isOpen);
        this.toggleBtn.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) this.scheduleRender();
    }

    openPanel() {
        this.panel.classList.add("open");
        this.root.classList.add("repo-explorer--open");
        this.toggleBtn.setAttribute("aria-expanded", "true");
        this.scheduleRender();
    }

    collapsePanel() {
        this.panel.classList.remove("open");
        this.root.classList.remove("repo-explorer--open");
        this.toggleBtn.setAttribute("aria-expanded", "false");
    }

    selectBuildingId(buildingId) {
        this.selectedBuildingId = buildingId || null;
        if (buildingId) {
            const file = this.files.find((f) => f.buildingId === buildingId);
            if (file) {
                this.expandPathToFile(file.path);
                this.rebuildFlatRows();
            }
            this.scheduleRender();
            this.scrollToSelected();
        } else {
            this.scheduleRender();
        }
    }

    expandPathToFile(filePath) {
        const parts = filePath.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
            acc = acc ? `${acc}/${parts[i]}` : parts[i];
            this.expandedPaths.add(acc || "/");
        }
        this.expandedPaths.add("/");
    }

    rebuildFlatRows() {
        this.flatRows = [];
        if (!this.treeRoot) return;

        const matchesSearch = (node) => {
            if (!this.searchQuery) return true;
            const label = node.label.toLowerCase();
            const path = (node.path || node.label).toLowerCase();
            return (
                label.includes(this.searchQuery) ||
                path.includes(this.searchQuery)
            );
        };

        const subtreeMatches = (n) => {
            if (n.type === "file") return matchesSearch(n);
            return n.children.some((child) => subtreeMatches(child));
        };

        const walk = (node, depth) => {
            if (node.type === "folder") {
                const childMatch = node.children.some((c) => subtreeMatches(c));

                if (!this.searchQuery && node.path !== "/") {
                    if (!this.expandedPaths.has(node.path)) {
                        this.flatRows.push({
                            type: "folder",
                            node,
                            depth,
                            collapsed: true,
                        });
                        return;
                    }
                }
                if (this.searchQuery && !childMatch && node.path !== "/") return;

                if (node.path !== "/") {
                    this.flatRows.push({
                        type: "folder",
                        node,
                        depth,
                        collapsed: false,
                    });
                }
                for (const child of node.children) {
                    walk(child, node.path === "/" ? depth : depth + 1);
                }
            } else if (node.type === "file") {
                if (matchesSearch(node)) {
                    this.flatRows.push({ type: "file", node, depth });
                }
            }
        };

        walk(this.treeRoot, 0);
        this.spacer.style.height = `${this.flatRows.length * ROW_HEIGHT}px`;
    }

    scheduleRender() {
        if (this.renderRaf) return;
        this.renderRaf = requestAnimationFrame(() => {
            this.renderRaf = null;
            this.renderVisibleRows();
        });
    }

    renderVisibleRows() {
        const scrollTop = this.treeWrap.scrollTop;
        const viewHeight = this.treeWrap.clientHeight;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
        const visibleCount =
            Math.ceil(viewHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
        const end = Math.min(this.flatRows.length, start + visibleCount);

        const fragment = document.createDocumentFragment();
        const offsetY = start * ROW_HEIGHT;
        this.itemsEl.style.transform = `translateY(${offsetY}px)`;

        for (let i = start; i < end; i++) {
            const row = this.flatRows[i];
            const el = document.createElement("div");
            el.className = "repo-tree-row";
            el.style.height = `${ROW_HEIGHT}px`;
            const indent = 8 + row.depth * 16;
            el.style.paddingLeft = `${indent}px`;
            if (row.depth > 0) el.classList.add(`repo-tree-row--depth-${row.depth}`);

            if (row.type === "folder") {
                el.classList.add("repo-tree-folder");
                el.innerHTML = `${folderChevronHtml(row.collapsed)}${folderIconHtml()}<span class="repo-tree-label">${escapeHtml(row.node.label)}</span>`;
                el.dataset.path = row.node.path;
                el.dataset.kind = "folder";
            } else {
                const hasBuilding = !!row.node.buildingId;
                el.classList.add("repo-tree-file");
                if (!hasBuilding) el.classList.add("no-building");
                if (row.node.buildingId === this.selectedBuildingId) {
                    el.classList.add("selected");
                }
                el.innerHTML = `<span class="repo-tree-chevron repo-tree-spacer"></span>${fileIconHtml(row.node.label)}<span class="repo-tree-label">${escapeHtml(row.node.label)}</span>`;
                el.dataset.path = row.node.path;
                el.dataset.buildingId = row.node.buildingId || "";
                el.dataset.kind = "file";
            }
            fragment.appendChild(el);
        }

        this.itemsEl.innerHTML = "";
        this.itemsEl.appendChild(fragment);
    }

    onTreeClick(e) {
        const row = e.target.closest(".repo-tree-row");
        if (!row) return;

        const kind = row.dataset.kind;
        const path = row.dataset.path;

        if (kind === "folder") {
            if (this.expandedPaths.has(path)) {
                this.expandedPaths.delete(path);
            } else {
                this.expandedPaths.add(path);
            }
            this.rebuildFlatRows();
            this.scheduleRender();
            return;
        }

        const buildingId = row.dataset.buildingId;
        if (!buildingId) return;

        this.selectedBuildingId = buildingId;
        this.scheduleRender();
        const file = this.files.find((f) => f.buildingId === buildingId);
        if (file) this.showFileDetails(file);
        if (this.onFileSelect) this.onFileSelect(file);
    }

    scrollToSelected() {
        if (!this.selectedBuildingId) return;
        const index = this.flatRows.findIndex(
            (r) =>
                r.type === "file" &&
                r.node.buildingId === this.selectedBuildingId,
        );
        if (index < 0) return;
        const top = index * ROW_HEIGHT;
        const viewHeight = this.treeWrap.clientHeight;
        this.treeWrap.scrollTop = Math.max(0, top - viewHeight / 2 + ROW_HEIGHT);
        this.scheduleRender();
    }
}

function buildTreeFromFiles(files, repoName = "repository") {
    const root = {
        type: "folder",
        label: repoName,
        path: "/",
        children: [],
    };

    const folderNodes = new Map();
    folderNodes.set("/", root);

    const ensureFolder = (folderPath) => {
        if (folderPath === "/" || folderPath === "") return root;
        if (folderNodes.has(folderPath)) return folderNodes.get(folderPath);

        const parts = folderPath.split("/").filter(Boolean);
        let currentPath = "";
        let parent = root;

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!folderNodes.has(currentPath)) {
                const node = {
                    type: "folder",
                    label: part,
                    path: currentPath,
                    children: [],
                };
                folderNodes.set(currentPath, node);
                parent.children.push(node);
            }
            parent = folderNodes.get(currentPath);
        }
        return parent;
    };

    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    for (const file of sorted) {
        const parentPath =
            file.path.includes("/") ?
                file.path.slice(0, file.path.lastIndexOf("/"))
            :   "";
        const parent = ensureFolder(parentPath);
        parent.children.push({
            type: "file",
            label: file.name,
            path: file.path,
            buildingId: file.buildingId,
            file,
        });
    }

    sortTreeChildren(root);
    return root;
}

function sortTreeChildren(node) {
    if (node.type !== "folder") return;
    node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.label.localeCompare(b.label);
    });
    for (const child of node.children) {
        if (child.type === "folder") sortTreeChildren(child);
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
