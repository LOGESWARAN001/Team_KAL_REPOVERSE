/**
 * Non-fire warning indicators for medium-severity building issues.
 */

import * as THREE from "three";

import { getEnrichedBuildingMeta } from "./buildingIndex.js";
import { computeBuildingRoofAnchor } from "./buildingRegistry.js";
import { logIssueVisualization } from "./cityDiagnostics.js";
import { shouldSpawnBugIndicatorForMeta } from "./repoHealthAnalysis.js";

const WARN_AMBER = 0xffb347;
const activeWarnings = new Map();
let sceneRef = null;

export function initIssueIndicators(scene) {
    sceneRef = scene;
}

export function clearIssueIndicators() {
    for (const entry of activeWarnings.values()) {
        if (entry.group?.parent) entry.group.parent.remove(entry.group);
        entry.group.traverse((child) => {
            if (child.geometry) child.geometry.dispose?.();
            if (child.material) child.material.dispose?.();
        });
    }
    activeWarnings.clear();
}

export function spawnIssueIndicators(
    fileMetaGrid,
    explorerFiles = [],
    attempt = 0,
) {
    if (!sceneRef) return;
    if (attempt === 0) clearIssueIndicators();

    const seen = new Set();
    const candidates = [];

    const consider = (raw) => {
        const meta = getEnrichedBuildingMeta(raw);
        if (!meta?.buildingId || seen.has(meta.buildingId)) return;
        if (!shouldSpawnBugIndicatorForMeta(meta)) return;
        seen.add(meta.buildingId);
        candidates.push(meta);
    };

    for (const row of fileMetaGrid || []) {
        for (const cell of row) consider(cell);
    }
    for (const file of explorerFiles) consider(file);

    if (candidates.length === 0) return;

    let spawned = 0;
    for (const meta of candidates) {
        if (trySpawnWarningBeacon(meta)) {
            spawned++;
            logIssueVisualization({
                filePath: meta.filePath || meta.path,
                issuesFound: meta.issueCount || 0,
                severity: meta.severityLabel,
                mappedBuilding: meta.buildingId,
                fireTrigger: false,
                bugIndicator: true,
                healthScore: meta.healthScore,
            });
        }
    }

    if (spawned === 0 && attempt < 80) {
        setTimeout(
            () =>
                spawnIssueIndicators(fileMetaGrid, explorerFiles, attempt + 1),
            150,
        );
    }
}

export function trySpawnWarningBeacon(meta) {
    if (!meta?.buildingId || activeWarnings.has(meta.buildingId)) {
        return activeWarnings.has(meta.buildingId);
    }
    return addWarningBeacon(meta);
}

function addWarningBeacon(meta) {
    const anchor = computeBuildingRoofAnchor(meta.buildingId);
    if (!anchor || !sceneRef) return false;

    const { center, roofY } = anchor;
    const group = new THREE.Group();
    group.name = "IssueWarning";
    group.position.set(center.x, roofY + 0.75, center.z);

    const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        new THREE.MeshBasicMaterial({
            color: WARN_AMBER,
            transparent: true,
            opacity: 0.75,
        }),
    );
    group.add(orb);

    sceneRef.add(group);
    activeWarnings.set(meta.buildingId, {
        meta,
        group,
        orb,
        phase: 0,
    });
    return true;
}

export function updateIssueIndicators(delta) {
    for (const entry of activeWarnings.values()) {
        entry.phase += delta * 3;
        const pulse = 0.6 + Math.sin(entry.phase) * 0.4;
        if (entry.orb?.material) {
            entry.orb.material.opacity = 0.55 + pulse * 0.3;
            entry.orb.scale.setScalar(0.9 + pulse * 0.15);
        }
    }
}
