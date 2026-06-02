/**
 * Collapsible repository statistics panel (mirrors Repository Explorer pattern).
 */

import { svgChevron, svgClose, svgStats } from "./explorerIcons.js";

function sectionChevron(collapsed) {
    return `<span class="stats-section-chevron">${svgChevron(collapsed)}</span>`;
}

export class CityStatsPanel {
    constructor(rootEl) {
        this.root = rootEl;
        this.toggleBtn = rootEl.querySelector("#cityStatsToggle");
        this.panel = rootEl.querySelector("#cityStatsPanel");
        this.closeBtn = rootEl.querySelector("#cityStatsClose");
        this.body = rootEl.querySelector("#cityStatsBody");

        this.toggleBtn.innerHTML = svgStats();
        this.closeBtn.innerHTML = svgClose();

        this.toggleBtn.addEventListener("click", () => this.togglePanel());
        this.closeBtn.addEventListener("click", () => this.collapsePanel());
        this.body.addEventListener("click", (e) => this.onSectionClick(e));
    }

    togglePanel() {
        const isOpen = this.panel.classList.toggle("open");
        this.root.classList.toggle("city-stats--open", isOpen);
        this.toggleBtn.setAttribute("aria-expanded", String(isOpen));
    }

    openPanel() {
        this.panel.classList.add("open");
        this.root.classList.add("city-stats--open");
        this.toggleBtn.setAttribute("aria-expanded", "true");
    }

    collapsePanel() {
        this.panel.classList.remove("open");
        this.root.classList.remove("city-stats--open");
        this.toggleBtn.setAttribute("aria-expanded", "false");
    }

    show() {
        this.root.classList.remove("hidden");
    }

    hide() {
        this.root.classList.add("hidden");
        this.collapsePanel();
        this.body.innerHTML = "";
    }

    setStats(stats) {
        if (!this.body) return;

        const languages =
            stats.languages.length > 0
                ? stats.languages
                      .slice(0, 6)
                      .map((l) => `${l.name} (${l.count})`)
                      .join(", ")
                : "—";
        const largest = stats.largestFile
            ? `${stats.largestFile.name} (${stats.largestFile.sizeFormatted})`
            : "—";
        const truncatedNote = stats.truncated
            ? `<p class="stats-note">Showing ${stats.totalFiles} of ${stats.totalFilesInRepo} files in the city.</p>`
            : "";

        this.body.innerHTML = `
            <section class="stats-section">
                <button type="button" class="stats-section-header" aria-expanded="false">
                    ${sectionChevron(true)}
                    <span>Files &amp; Folders</span>
                </button>
                <div class="stats-section-body">
                    <div class="stats-row"><span>Total Files</span><strong>${stats.totalFiles}</strong></div>
                    <div class="stats-row"><span>Total Folders</span><strong>${stats.totalFolders}</strong></div>
                </div>
            </section>
            <section class="stats-section">
                <button type="button" class="stats-section-header" aria-expanded="false">
                    ${sectionChevron(true)}
                    <span>Code Overview</span>
                </button>
                <div class="stats-section-body">
                    <div class="stats-row"><span>Lines of Code</span><strong>${stats.linesOfCode.toLocaleString()}</strong></div>
                    <div class="stats-row"><span>Largest File</span><strong>${largest}</strong></div>
                    <div class="stats-row"><span>Languages Used</span><strong>${languages}</strong></div>
                    ${truncatedNote}
                </div>
            </section>
        `;
    }

    onSectionClick(e) {
        const header = e.target.closest(".stats-section-header");
        if (!header) return;

        const section = header.closest(".stats-section");
        const body = section?.querySelector(".stats-section-body");
        if (!section || !body) return;

        section.classList.toggle("stats-section--open");
        const isNowOpen = section.classList.contains("stats-section--open");
        header.setAttribute("aria-expanded", String(isNowOpen));

        const chevron = header.querySelector(".stats-section-chevron");
        if (chevron) {
            chevron.innerHTML = svgChevron(!isNowOpen);
        }
    }
}
