/**
 * Maps buildingId ↔ Three.js meshes and file metadata.
 */

import * as THREE from "three";

const buildings = new Map();

export function clearBuildingRegistry() {
    buildings.clear();
}

export function registerBuildingMesh(buildingId, meta, object3d) {
    if (!buildingId) return;
    let entry = buildings.get(buildingId);
    if (!entry) {
        entry = { meta: { ...meta }, meshes: [] };
        buildings.set(buildingId, entry);
    }
    entry.meshes.push(object3d);
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
        box.expandByObject(root);
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { center, box, size };
}
