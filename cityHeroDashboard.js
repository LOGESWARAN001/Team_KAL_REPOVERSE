/**
 * City Hero progress dashboard HUD.
 */

import { getHeroProgress, subscribeHeroProgress } from "./heroProgress.js";

let rootEl = null;

export function initCityHeroDashboard() {
    rootEl = document.getElementById("cityHeroDashboard");
    if (!rootEl) return;

    subscribeHeroProgress(render);
    render(getHeroProgress());
}

function render(progress) {
    if (!rootEl) return;

    rootEl.innerHTML = `
        <header class="hero-dashboard-header">
            <span class="hero-dashboard-title">🏙️ City Progress</span>
        </header>
        <div class="hero-dashboard-grid">
            <div class="hero-stat">
                <span class="hero-stat-value">${progress.buildingsRepaired}</span>
                <span class="hero-stat-label">Repaired</span>
            </div>
            <div class="hero-stat">
                <span class="hero-stat-value">${progress.issuesResolved}</span>
                <span class="hero-stat-label">Resolved</span>
            </div>
            <div class="hero-stat">
                <span class="hero-stat-value">${progress.heroScore}</span>
                <span class="hero-stat-label">Hero Score</span>
            </div>
            <div class="hero-stat">
                <span class="hero-stat-value">${progress.cityHealth}%</span>
                <span class="hero-stat-label">City Health</span>
            </div>
        </div>
        <div class="hero-dashboard-bar">
            <div class="hero-dashboard-bar-fill" style="width: ${progress.cityHealth}%"></div>
        </div>
        <div class="hero-dashboard-footer">
            <span>⭐ ${progress.xp} XP</span>
            <span>🦸 ${progress.heroBadges} Badges</span>
        </div>
    `;
}

export function showCityHeroDashboard() {
    rootEl?.classList.remove("hidden");
}

export function hideCityHeroDashboard() {
    rootEl?.classList.add("hidden");
}
