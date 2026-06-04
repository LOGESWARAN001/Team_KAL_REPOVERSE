/**
 * Hides baked-in river/ship meshes from environment GLBs and fills the river with land.
 */

import * as THREE from "three";

const RIVER_MESH_NAME = "Cube001_4";
const SHIP_GROUP_NAMES = ["Cube012", "Cube013", "Cube014"];
const SHIP_ANIMATION_PATTERN = /Cube\.01[234]Action/;

/** Island grass color (matches environment.glb Cube001). */
const ISLAND_GRASS_COLOR = 0x43754d;

/** River channel placement in environment.glb local space. */
const RIVER_LAND_POSITION = new THREE.Vector3(0, 1.5, 44.4);
const RIVER_LAND_SIZE = new THREE.Vector3(120, 3, 32);

export function removeRiverMeshes(envRoot) {
    envRoot.traverse((child) => {
        if (child.isMesh && child.name === RIVER_MESH_NAME) {
            child.visible = false;
        }
    });
}

export function createRiverLandFill() {
    const land = new THREE.Mesh(
        new THREE.BoxGeometry(
            RIVER_LAND_SIZE.x,
            RIVER_LAND_SIZE.y,
            RIVER_LAND_SIZE.z,
        ),
        new THREE.MeshLambertMaterial({ color: ISLAND_GRASS_COLOR }),
    );
    land.name = "RiverLandFill";
    land.position.copy(RIVER_LAND_POSITION);
    land.receiveShadow = true;
    return land;
}

export function removeShipFromAnimated(animatedRoot) {
    for (const name of SHIP_GROUP_NAMES) {
        const node = animatedRoot.getObjectByName(name);
        if (node) node.visible = false;
    }
}

export function shouldPlayEnvironmentAnimation(clipName) {
    return !SHIP_ANIMATION_PATTERN.test(clipName);
}
