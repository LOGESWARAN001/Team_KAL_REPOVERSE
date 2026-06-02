/**
 * Building highlight, camera focus, and selection state.
 */

import * as THREE from "three";

import {
    expandBuildingBox,
    getBuilding,
    getBuildingIdFromObject,
} from "./buildingRegistry.js";

const HIGHLIGHT_EMISSIVE = 0x30e1b7;
const HIGHLIGHT_INTENSITY = 0.45;

let camera = null;
let controls = null;
let selectedBuildingId = null;
let highlightMaterials = [];
let focusAnimationId = null;
let onSelectionChange = null;

export function initBuildingSelection(_sceneRef, cameraRef, controlsRef) {
    camera = cameraRef;
    controls = controlsRef;
}

export function setOnSelectionChange(callback) {
    onSelectionChange = callback;
}

export function getSelectedBuildingId() {
    return selectedBuildingId;
}

export function clearBuildingSelection() {
    restoreHighlightMaterials();
    selectedBuildingId = null;
    if (onSelectionChange) onSelectionChange(null);
}

export function selectBuildingById(buildingId, options = {}, attempt = 0) {
    if (!buildingId) {
        clearBuildingSelection();
        return null;
    }
    if (!getBuilding(buildingId)) {
        if (attempt < 25 && options.retry !== false) {
            setTimeout(
                () => selectBuildingById(buildingId, options, attempt + 1),
                120,
            );
        }
        return null;
    }
    if (selectedBuildingId === buildingId && !options.force) {
        return getBuilding(buildingId).meta;
    }

    restoreHighlightMaterials();
    selectedBuildingId = buildingId;
    applyHighlight(buildingId);

    if (options.focusCamera !== false) {
        focusCameraOnBuilding(buildingId);
    }

    const meta = getBuilding(buildingId).meta;
    if (onSelectionChange) onSelectionChange(meta);
    return meta;
}

export function selectBuildingFromObject(object, options = {}) {
    const buildingId = getBuildingIdFromObject(object);
    if (!buildingId) {
        clearBuildingSelection();
        return null;
    }
    return selectBuildingById(buildingId, options);
}

function applyHighlight(buildingId) {
    const entry = getBuilding(buildingId);
    if (!entry) return;

    for (const root of entry.meshes) {
        root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
            for (const mat of materials) {
                if (!mat.emissive) continue;
                highlightMaterials.push({
                    mat,
                    emissive: mat.emissive.getHex(),
                    intensity: mat.emissiveIntensity,
                });
                mat.emissive.setHex(HIGHLIGHT_EMISSIVE);
                mat.emissiveIntensity = HIGHLIGHT_INTENSITY;
            }
        });
    }
}

function restoreHighlightMaterials() {
    for (const { mat, emissive, intensity } of highlightMaterials) {
        mat.emissive.setHex(emissive);
        mat.emissiveIntensity = intensity;
    }
    highlightMaterials = [];
}

function focusCameraOnBuilding(buildingId) {
    const bounds = expandBuildingBox(buildingId);
    if (!bounds || !camera || !controls) return;

    if (focusAnimationId) cancelAnimationFrame(focusAnimationId);

    controls.autoRotate = false;
    const autoRotateBtn = document.getElementById("autorotate");
    if (autoRotateBtn) autoRotateBtn.classList.add("inactive");

    const { center, size } = bounds;
    const span = Math.max(size.x, size.y, size.z, 4);
    const distance = Math.min(
        Math.max(span * 2.8, 28),
        controls.maxDistance - 5,
    );

    const startTarget = controls.target.clone();
    const endTarget = center.clone();
    const startPos = camera.position.clone();
    const viewDir = new THREE.Vector3()
        .subVectors(startPos, startTarget)
        .normalize();
    if (viewDir.lengthSq() < 0.01) {
        viewDir.set(0.35, 0.55, 1).normalize();
    }
    const endPos = endTarget.clone().add(viewDir.multiplyScalar(distance));
    endPos.y = Math.max(endPos.y, endTarget.y + span * 0.6 + 8);

    const duration = 700;
    const startTime = performance.now();

    function tick(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - t) ** 3;
        controls.target.lerpVectors(startTarget, endTarget, ease);
        camera.position.lerpVectors(startPos, endPos, ease);
        controls.update();
        if (t < 1) {
            focusAnimationId = requestAnimationFrame(tick);
        } else {
            focusAnimationId = null;
        }
    }
    focusAnimationId = requestAnimationFrame(tick);
}
