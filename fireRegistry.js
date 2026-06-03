/**
 * Registry for fire building effect instances.
 */

const fireByBuilding = new Map();

export function clearFireRegistry() {
    fireByBuilding.clear();
}

export function registerFireBuilding(buildingId, entry) {
    if (buildingId) fireByBuilding.set(buildingId, entry);
}

export function getFireBuilding(buildingId) {
    return fireByBuilding.get(buildingId) || null;
}

export function getAllFireBuildings() {
    return [...fireByBuilding.values()];
}

export function isFireBuildingId(buildingId) {
    return fireByBuilding.has(buildingId);
}

export function removeFireBuilding(buildingId) {
    fireByBuilding.delete(buildingId);
}
