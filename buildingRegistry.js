/**
 * Maps buildingId ↔ Three.js meshes and file metadata.
 */

import * as THREE from "three";

const buildings = new Map();
let onBuildingMeshRegistered = null;

export function setOnBuildingMeshRegistered(callback) {
    onBuildingMeshRegistered = callback;
}

export function clearBuildingRegistry() {
    buildings.clear();
}

export function registerBuildingMesh(buildingId, meta, object3d) {
    if (!buildingId) return;
    let entry = buildings.get(buildingId);
    if (!entry) {
        entry = { meta: { ...meta, buildingId }, meshes: [] };
        buildings.set(buildingId, entry);
    }
    entry.meshes.push(object3d);

    const filePath = meta.filePath || meta.path;
    object3d.traverse((child) => {
        child.userData.buildingId = buildingId;
        if (filePath) child.userData.filePath = filePath;
        child.userData.isBuilding = true;
    });

    if (onBuildingMeshRegistered) {
        onBuildingMeshRegistered(entry.meta);
    }
}

export function getBuilding(buildingId) {
    return buildings.get(buildingId) || null;
}

export function getBuildingIdFromObject(object) {
    let obj = object;
    while (obj) {
        if (obj.userData?.buildingId) return obj.userData.buildingId;
        obj = obj.parent;
    }
    return null;
}

export function expandBuildingBox(buildingId) {
    const entry = buildings.get(buildingId);
    if (!entry || entry.meshes.length === 0) return null;
    const box = new THREE.Box3();
    for (const root of entry.meshes) {
        root.updateMatrixWorld(true);
        box.expandByObject(root);
    }
    if (box.isEmpty()) return null;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.lengthSq() < 1e-6) return null;
    return { center, box, size };
}

/** World-space anchor on the roof — used for syntax fire (avoids road / ground placement). */
export function computeBuildingRoofAnchor(buildingId) {
    const entry = buildings.get(buildingId);
    if (!entry?.meshes?.length) return null;

    const fullBox = new THREE.Box3();
    for (const root of entry.meshes) {
        root.updateMatrixWorld(true);
        fullBox.expandByObject(root);
    }
    if (fullBox.isEmpty()) return null;

    const fullSize = new THREE.Vector3();
    fullBox.getSize(fullSize);
    if (fullSize.y < 1) return null;

    const roofY = fullBox.max.y;
    const roofCutoff = roofY - Math.min(1.2, fullSize.y * 0.22);
    const roofBox = new THREE.Box3();
    let hasRoofGeometry = false;

    for (const root of entry.meshes) {
        const partBox = new THREE.Box3().setFromObject(root);
        if (partBox.max.y >= roofCutoff) {
            roofBox.union(partBox);
            hasRoofGeometry = true;
        }
    }

    const box = hasRoofGeometry && !roofBox.isEmpty() ? roofBox : fullBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const footprint = Math.min(Math.max(size.x, 0.4), Math.max(size.z, 0.4));

    return {
        center,
        roofY,
        box: fullBox,
        size,
        footprint,
    };
}

export function markBuildingRepaired(buildingId) {
    const entry = buildings.get(buildingId);
    if (!entry) return;
    entry.meta = {
        ...entry.meta,
        buildFailed: false,
        hasBug: false,
        repaired: true,
        missionComplete: true,
    };
    for (const root of entry.meshes) {
        if (root.userData) {
            root.userData.repaired = true;
        }
    }
}
