/**
 * 3D + DOM celebration effects when a building is repaired.
 */

import * as THREE from "three";

import { expandBuildingBox, getBuilding } from "./buildingRegistry.js";

const BRAND_GREEN = 0x30e1b7;
let sceneRef = null;
const activeEffects = [];

export function initCityRewards(scene) {
    sceneRef = scene;
}

export function celebrateBuildingRepair(buildingId) {
    if (!sceneRef || !buildingId) return;

    const bounds = expandBuildingBox(buildingId);
    if (!bounds) return;

    const { center, size } = bounds;
    const roofY = bounds.box.max.y;

    applyHealthyGlow(buildingId);

    const light = new THREE.PointLight(BRAND_GREEN, 2.5, 20);
    light.position.set(center.x, roofY + 2, center.z);
    sceneRef.add(light);

    const group = new THREE.Group();
    group.name = "RepairCelebration";
    sceneRef.add(group);

    for (let i = 0; i < 35; i++) {
        const geo = new THREE.PlaneGeometry(0.12, 0.12);
        const color =
            i % 3 === 0 ? 0x30e1b7 : i % 3 === 1 ? 0xe1ba30 : 0xffffff;
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            center.x + (Math.random() - 0.5) * size.x,
            roofY + Math.random() * 2,
            center.z + (Math.random() - 0.5) * size.z,
        );
        group.add(mesh);
        activeEffects.push({
            mesh,
            life: 1.5 + Math.random(),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                2 + Math.random() * 3,
                (Math.random() - 0.5) * 2,
            ),
            group,
            light,
        });
    }

    spawnDomConfetti();
}

function applyHealthyGlow(buildingId) {
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
                mat.emissive.setHex(BRAND_GREEN);
                mat.emissiveIntensity = 0.35;
            }
        });
    }

    setTimeout(() => {
        for (const root of entry.meshes) {
            root.traverse((child) => {
                if (!child.isMesh || !child.material) return;
                const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                for (const mat of materials) {
                    if (!mat.emissive) continue;
                    mat.emissive.setHex(0x000000);
                    mat.emissiveIntensity = 0;
                }
            });
        }
    }, 4000);
}

function spawnDomConfetti() {
    let layer = document.getElementById("cityConfettiLayer");
    if (!layer) {
        layer = document.createElement("div");
        layer.id = "cityConfettiLayer";
        layer.className = "city-confetti-layer";
        document.body.appendChild(layer);
    }
    layer.innerHTML = "";
    const colors = ["#30e1b7", "#e1ba30", "#ffffff", "#ff6b35"];
    for (let i = 0; i < 50; i++) {
        const piece = document.createElement("span");
        piece.className = "city-confetti-piece";
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[i % colors.length];
        piece.style.animationDelay = `${Math.random() * 0.4}s`;
        piece.style.animationDuration = `${1.2 + Math.random()}s`;
        layer.appendChild(piece);
    }
    setTimeout(() => {
        if (layer) layer.innerHTML = "";
    }, 3000);
}

export function updateCityRewards(delta) {
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const p = activeEffects[i];
        p.life -= delta;
        p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
        p.velocity.y -= delta * 3;
        p.mesh.material.opacity = Math.max(0, p.life / 1.5);
        p.mesh.rotation.z += delta * 4;
        if (p.life <= 0) {
            p.group.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            activeEffects.splice(i, 1);
        }
    }

    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const p = activeEffects[i];
        if (p.light && p.life <= 0) {
            sceneRef?.remove(p.light);
            if (p.group.children.length === 0) {
                sceneRef?.remove(p.group);
            }
        }
    }
}

export function clearCityRewards() {
    for (const p of activeEffects) {
        if (p.light) sceneRef?.remove(p.light);
        if (p.group) sceneRef?.remove(p.group);
    }
    activeEffects.length = 0;
    const layer = document.getElementById("cityConfettiLayer");
    if (layer) layer.innerHTML = "";
}
