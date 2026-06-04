/**
 * Debug overlay for building ↔ file mapping validation.
 */

import { expandBuildingBox } from "./buildingRegistry.js";
import { isCityDebugEnabled } from "./cityDiagnostics.js";
import { shouldSpawnFireForMeta } from "./repoHealthAnalysis.js";

let overlayEl = null;
let worldLabelEl = null;
let debugCamera = null;
let debugRenderer = null;
let worldLabelRaf = null;
let trackedBuildingId = null;

export function initCityDebugOverlay() {
    overlayEl = document.getElementById("cityDebugOverlay");
    if (!overlayEl) {
        overlayEl = document.createElement("div");
        overlayEl.id = "cityDebugOverlay";
        overlayEl.className = "city-debug-overlay hidden";
        document.body.appendChild(overlayEl);
    }

    worldLabelEl = document.getElementById("cityDebugWorldLabel");
    if (!worldLabelEl) {
        worldLabelEl = document.createElement("div");
        worldLabelEl.id = "cityDebugWorldLabel";
        worldLabelEl.className = "city-debug-world-label hidden";
        document.body.appendChild(worldLabelEl);
    }
}

export function setCityDebugSceneRefs(camera, renderer) {
    debugCamera = camera;
    debugRenderer = renderer;
}

export function showBuildingDebugLabel(meta) {
    if (!overlayEl) initCityDebugOverlay();
    if (!overlayEl) return;

    if (!isCityDebugEnabled() || !meta) {
        hideBuildingDebugLabel();
        return;
    }

    overlayEl.classList.remove("hidden");
    overlayEl.innerHTML = `
        <p class="city-debug-title">🔍 Debug — Selected Building</p>
        <div class="city-debug-row"><span>Building ID</span><code>${escapeHtml(meta.buildingId || "—")}</code></div>
        <div class="city-debug-row"><span>File Name</span><code>${escapeHtml(meta.fileName || "—")}</code></div>
        <div class="city-debug-row"><span>File Path</span><code>${escapeHtml(meta.filePath || meta.path || "—")}</code></div>
        <div class="city-debug-row"><span>Issue Count</span><code>${meta.issueCount ?? 0}</code></div>
        <div class="city-debug-row"><span>Health Score</span><code>${meta.healthScore ?? "—"}</code></div>
        <div class="city-debug-row"><span>Fire Active</span><code>${shouldSpawnFireForMeta(meta) ? "yes" : "no"}</code></div>
    `;

    trackedBuildingId = meta.buildingId || null;
    updateWorldDebugLabel(meta);
    startWorldLabelTracking();
}

export function hideBuildingDebugLabel() {
    overlayEl?.classList.add("hidden");
    stopWorldLabelTracking();
    if (worldLabelEl) {
        worldLabelEl.classList.add("hidden");
        worldLabelEl.innerHTML = "";
    }
    trackedBuildingId = null;
}

function startWorldLabelTracking() {
    if (worldLabelRaf || !isCityDebugEnabled()) return;

    const tick = () => {
        if (!trackedBuildingId || !isCityDebugEnabled()) {
            stopWorldLabelTracking();
            return;
        }
        const bounds = expandBuildingBox(trackedBuildingId);
        if (bounds && worldLabelEl && !worldLabelEl.classList.contains("hidden")) {
            positionWorldLabel(bounds.center);
        }
        worldLabelRaf = requestAnimationFrame(tick);
    };
    worldLabelRaf = requestAnimationFrame(tick);
}

function stopWorldLabelTracking() {
    if (worldLabelRaf) {
        cancelAnimationFrame(worldLabelRaf);
        worldLabelRaf = null;
    }
}

function updateWorldDebugLabel(meta) {
    if (!worldLabelEl) return;
    worldLabelEl.classList.remove("hidden");
    worldLabelEl.innerHTML = `
        <p class="city-debug-world-title">${escapeHtml(meta.buildingId || "—")}</p>
        <p>${escapeHtml(meta.fileName || "—")}</p>
        <p class="city-debug-world-path">${escapeHtml(meta.filePath || meta.path || "—")}</p>
    `;
    const bounds = expandBuildingBox(meta.buildingId);
    if (bounds) positionWorldLabel(bounds.center);
}

function positionWorldLabel(center) {
    if (!worldLabelEl || !debugCamera || !debugRenderer) return;
    const projected = center.clone().project(debugCamera);
    const rect = debugRenderer.domElement.getBoundingClientRect();
    const x = rect.left + ((projected.x + 1) / 2) * rect.width;
    const y = rect.top + ((-projected.y + 1) / 2) * rect.height;
    worldLabelEl.style.left = `${x}px`;
    worldLabelEl.style.top = `${y - 12}px`;
    worldLabelEl.style.transform = "translate(-50%, -100%)";
    worldLabelEl.style.visibility =
        projected.z > 1 ? "hidden" : "visible";
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
