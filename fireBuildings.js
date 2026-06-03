/**
 * Fire Building effects — cartoon CI failure visualization.
 */

import * as THREE from "three";

import { expandBuildingBox, getBuilding } from "./buildingRegistry.js";
import {
    clearFireRegistry,
    getAllFireBuildings,
    registerFireBuilding,
    removeFireBuilding,
} from "./fireRegistry.js";

const FIRE_ORANGE = 0xff6b35;
const FIRE_YELLOW = 0xffd166;
const WARN_RED = 0xff2d2d;
const SMOKE_DARK = 0x2d2d2d;

const SEVERITY_CONFIG = {
    minor: {
        smokeRate: 0.35,
        flameCount: 2,
        lightIntensity: 0.8,
        smokeHeight: 4,
        trucks: 0,
        watchers: 0,
    },
    medium: {
        smokeRate: 0.7,
        flameCount: 4,
        lightIntensity: 1.4,
        smokeHeight: 7,
        trucks: 0,
        watchers: 2,
    },
    critical: {
        smokeRate: 1.2,
        flameCount: 6,
        lightIntensity: 2.2,
        smokeHeight: 12,
        trucks: 2,
        watchers: 3,
    },
};

let sceneRef = null;
let fireGroup = null;
let particlePool = [];
let sharedGeometries = null;
let sharedMaterials = null;
const buildingGlowRestore = new Map();

function initSharedResources() {
    if (sharedGeometries) return;
    sharedGeometries = {
        flame: new THREE.ConeGeometry(0.25, 0.7, 6),
        smoke: new THREE.PlaneGeometry(0.5, 0.5),
        spark: new THREE.PlaneGeometry(0.08, 0.08),
        beacon: new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8),
        burn: new THREE.PlaneGeometry(0.35, 0.45),
        heat: new THREE.PlaneGeometry(1.2, 0.6),
        truckBody: new THREE.BoxGeometry(1.4, 0.5, 0.7),
        truckCab: new THREE.BoxGeometry(0.5, 0.45, 0.65),
        wheel: new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8),
        citizen: new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8),
    };
    sharedMaterials = {
        flame: new THREE.MeshLambertMaterial({
            color: FIRE_ORANGE,
            emissive: FIRE_YELLOW,
            emissiveIntensity: 0.8,
        }),
        flameCore: new THREE.MeshLambertMaterial({
            color: FIRE_YELLOW,
            emissive: 0xffffff,
            emissiveIntensity: 0.6,
        }),
        smoke: new THREE.MeshBasicMaterial({
            color: SMOKE_DARK,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
        smokeLight: new THREE.MeshBasicMaterial({
            color: 0x666666,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
        spark: new THREE.MeshBasicMaterial({
            color: FIRE_YELLOW,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
        beacon: new THREE.MeshLambertMaterial({
            color: WARN_RED,
            emissive: WARN_RED,
            emissiveIntensity: 1,
        }),
        burn: new THREE.MeshBasicMaterial({
            color: 0x1a0a0a,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
        }),
        heat: new THREE.MeshBasicMaterial({
            color: FIRE_ORANGE,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
        truck: new THREE.MeshLambertMaterial({ color: 0xcc0000 }),
        truckDetail: new THREE.MeshLambertMaterial({
            color: FIRE_YELLOW,
            emissive: FIRE_YELLOW,
            emissiveIntensity: 0.3,
        }),
        wheel: new THREE.MeshLambertMaterial({ color: 0x222222 }),
        citizen: new THREE.MeshLambertMaterial({ color: 0x5c7cfa }),
    };
}

export function initFireBuildings(scene) {
    sceneRef = scene;
    initSharedResources();
    fireGroup = new THREE.Group();
    fireGroup.name = "FireBuilding";
    scene.add(fireGroup);
}

function createHologramSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(255,45,45,0.85)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 22px Inter, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("⚠ BUILD FAILED", 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5, 1.25, 1);
    sprite.renderOrder = 998;
    return sprite;
}

function createFlameMesh() {
    initSharedResources();
    const group = new THREE.Group();
    const outer = new THREE.Mesh(sharedGeometries.flame, sharedMaterials.flame);
    outer.position.y = 0.35;
    const inner = new THREE.Mesh(
        sharedGeometries.flame,
        sharedMaterials.flameCore,
    );
    inner.scale.set(0.55, 0.65, 0.55);
    inner.position.y = 0.25;
    group.add(outer, inner);
    group.userData.outer = outer;
    group.userData.inner = inner;
    return group;
}

function createFireTruck(position, angle) {
    initSharedResources();
    const truck = new THREE.Group();
    const body = new THREE.Mesh(
        sharedGeometries.truckBody,
        sharedMaterials.truck,
    );
    body.position.y = 0.35;
    const cab = new THREE.Mesh(
        sharedGeometries.truckCab,
        sharedMaterials.truck,
    );
    cab.position.set(0.85, 0.38, 0);
    const light = new THREE.Mesh(
        sharedGeometries.beacon,
        sharedMaterials.truckDetail,
    );
    light.position.set(0.85, 0.75, 0);
    for (const wx of [-0.45, 0.45, 0.95]) {
        const wheel = new THREE.Mesh(sharedGeometries.wheel, sharedMaterials.wheel);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.15, 0.38);
        truck.add(wheel);
        const wheel2 = wheel.clone();
        wheel2.position.z = -0.38;
        truck.add(wheel2);
    }
    truck.add(body, cab, light);
    truck.position.copy(position);
    truck.rotation.y = angle;
    return truck;
}

function createWatcher(position, lookAt) {
    initSharedResources();
    const citizen = new THREE.Mesh(
        sharedGeometries.citizen,
        sharedMaterials.citizen,
    );
    citizen.position.copy(position);
    citizen.position.y = 0.45;
    citizen.lookAt(lookAt.x, citizen.position.y, lookAt.z);
    return citizen;
}

function applyBuildingFireGlow(buildingId, intensity) {
    const entry = getBuilding(buildingId);
    if (!entry) return [];

    const saved = [];
    for (const root of entry.meshes) {
        root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
            for (const mat of materials) {
                if (!mat.emissive) return;
                saved.push({
                    mat,
                    emissive: mat.emissive.getHex(),
                    intensity: mat.emissiveIntensity,
                });
                mat.emissive.setHex(WARN_RED);
                mat.emissiveIntensity = intensity;
            }
        });
    }
    buildingGlowRestore.set(buildingId, saved);
    return saved;
}

function restoreBuildingGlow(buildingId) {
    const saved = buildingGlowRestore.get(buildingId);
    if (!saved) return;
    for (const { mat, emissive, intensity } of saved) {
        mat.emissive.setHex(emissive);
        mat.emissiveIntensity = intensity;
    }
    buildingGlowRestore.delete(buildingId);
}

function spawnParticle(entry, kind, position, velocity, life) {
    initSharedResources();
    let p = particlePool.find((part) => !part.active);
    if (!p) {
        const mat =
            kind === "spark"
                ? sharedMaterials.spark
                : kind === "smokeLight"
                  ? sharedMaterials.smokeLight
                  : sharedMaterials.smoke;
        const mesh = new THREE.Mesh(sharedGeometries.smoke, mat);
        p = { mesh, active: false, kind, life: 0, maxLife: 1, velocity: new THREE.Vector3() };
        particlePool.push(p);
        fireGroup.add(mesh);
    }

    p.active = true;
    p.kind = kind;
    p.maxLife = life;
    p.life = life;
    p.mesh.position.copy(position);
    p.velocity.copy(velocity);
    p.mesh.material =
        kind === "spark"
            ? sharedMaterials.spark
            : kind === "smokeLight"
              ? sharedMaterials.smokeLight
              : sharedMaterials.smoke;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(kind === "spark" ? 0.5 : 1);
    entry.particles.push(p);
}

function setupFireBuilding(meta) {
    const buildingId = meta.buildingId;
    const bounds = expandBuildingBox(buildingId);
    if (!bounds) return null;

    const severity = meta.fireSeverity || "medium";
    const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;
    const { center, size, box } = bounds;
    const roofY = box.max.y;

    const group = new THREE.Group();
    group.name = "FireBuilding";

    const flames = [];
    for (let i = 0; i < config.flameCount; i++) {
        const flame = createFlameMesh();
        const angle = (i / config.flameCount) * Math.PI * 2;
        const rx = Math.cos(angle) * (size.x * 0.35 + 0.3);
        const rz = Math.sin(angle) * (size.z * 0.35 + 0.3);
        flame.position.set(center.x + rx, roofY, center.z + rz);
        flame.userData.phase = Math.random() * Math.PI * 2;
        flames.push(flame);
        group.add(flame);
    }

    const beacon = new THREE.Mesh(
        sharedGeometries.beacon,
        sharedMaterials.beacon,
    );
    beacon.position.set(center.x, roofY + 0.5, center.z);
    group.add(beacon);

    const hologram = createHologramSprite();
    hologram.position.set(center.x, roofY + config.smokeHeight * 0.45, center.z);
    group.add(hologram);

    const heat = new THREE.Mesh(sharedGeometries.heat, sharedMaterials.heat);
    heat.position.set(center.x, roofY + 0.8, center.z);
    heat.rotation.x = -Math.PI / 2;
    group.add(heat);

    for (let i = 0; i < 3; i++) {
        const burn = new THREE.Mesh(sharedGeometries.burn, sharedMaterials.burn);
        burn.position.set(
            center.x + (i - 1) * 0.4,
            center.y + size.y * (0.3 + i * 0.15),
            center.z + size.z * 0.48,
        );
        group.add(burn);
    }

    const warnLight = new THREE.PointLight(WARN_RED, config.lightIntensity, 18);
    warnLight.position.set(center.x, roofY + 1, center.z);
    group.add(warnLight);

    const fireLight = new THREE.PointLight(FIRE_ORANGE, config.lightIntensity * 0.8, 14);
    fireLight.position.set(center.x, roofY + 0.5, center.z);
    group.add(fireLight);

    const trucks = [];
    for (let t = 0; t < config.trucks; t++) {
        const angle = t * Math.PI + 0.4;
        const dist = Math.max(size.x, size.z) * 0.7 + 2;
        const pos = new THREE.Vector3(
            center.x + Math.cos(angle) * dist,
            0,
            center.z + Math.sin(angle) * dist,
        );
        trucks.push(createFireTruck(pos, angle + Math.PI / 2));
        group.add(trucks[trucks.length - 1]);
    }

    const watchers = [];
    for (let w = 0; w < config.watchers; w++) {
        const angle = w * 2.1 + 0.5;
        const pos = new THREE.Vector3(
            center.x + Math.cos(angle) * (size.x + 1.5),
            0,
            center.z + Math.sin(angle) * (size.z + 1.5),
        );
        const watcher = createWatcher(pos, center);
        watchers.push(watcher);
        group.add(watcher);
    }

    applyBuildingFireGlow(buildingId, severity === "critical" ? 0.35 : 0.2);

    const entry = {
        buildingId,
        meta,
        group,
        flames,
        beacon,
        hologram,
        heat,
        warnLight,
        fireLight,
        trucks,
        watchers,
        particles: [],
        config,
        bounds,
        pulsePhase: Math.random() * Math.PI * 2,
        sparkTimer: 0,
        smokeTimer: 0,
    };

    fireGroup.add(group);
    registerFireBuilding(buildingId, entry);
    return entry;
}

export function spawnFireBuildings(
    fileMetaGrid,
    explorerFiles = [],
    attempt = 0,
) {
    if (!fireGroup) return;

    const candidates = [];
    const seen = new Set();

    for (const row of fileMetaGrid || []) {
        for (const cell of row) {
            if (cell?.buildFailed && !seen.has(cell.buildingId)) {
                candidates.push(cell);
                seen.add(cell.buildingId);
            }
        }
    }

    for (const file of explorerFiles) {
        if (file?.buildFailed && !seen.has(file.buildingId)) {
            candidates.push(file);
            seen.add(file.buildingId);
        }
    }

    if (candidates.length === 0) return;

    let spawned = 0;
    for (const meta of candidates) {
        if (expandBuildingBox(meta.buildingId)) {
            setupFireBuilding(meta);
            spawned++;
        }
    }

    if (spawned === 0 && attempt < 25) {
        setTimeout(
            () => spawnFireBuildings(fileMetaGrid, explorerFiles, attempt + 1),
            150,
        );
    }
}

function animateFlames(entry, delta) {
    for (const flame of entry.flames) {
        flame.userData.phase += delta * 8;
        const s = 1 + Math.sin(flame.userData.phase) * 0.25;
        flame.scale.set(s, 0.85 + Math.sin(flame.userData.phase * 1.3) * 0.3, s);
        if (flame.userData.outer) {
            flame.userData.outer.material.emissiveIntensity =
                0.6 + Math.sin(flame.userData.phase * 2) * 0.35;
        }
    }
}

function animateBeacon(entry, delta) {
    entry.beacon.rotation.y += delta * 4;
    entry.pulsePhase += delta * 3;
    const pulse = 0.5 + Math.sin(entry.pulsePhase) * 0.5;
    entry.warnLight.intensity = entry.config.lightIntensity * (0.7 + pulse * 0.6);
    entry.fireLight.intensity =
        entry.config.lightIntensity * 0.8 * (0.8 + Math.sin(entry.pulsePhase * 2) * 0.3);
    entry.beacon.material.emissiveIntensity = 0.7 + pulse * 0.8;

    if (entry.meta.fireSeverity === "critical") {
        entry.hologram.material.opacity = 0.75 + Math.sin(entry.pulsePhase * 5) * 0.25;
    }
}

function animateHeat(entry, delta) {
    entry.heat.material.opacity =
        0.1 + Math.sin(entry.pulsePhase * 4) * 0.08;
    entry.heat.scale.x = 1 + Math.sin(entry.pulsePhase * 2) * 0.15;
    entry.heat.rotation.z += delta * 0.5;
}

function emitSmokeAndSparks(entry, delta) {
    entry.smokeTimer -= delta;
    entry.sparkTimer -= delta;

    const { center, box } = entry.bounds;
    const roofY = box.max.y;

    if (entry.smokeTimer <= 0) {
        entry.smokeTimer = 0.08 / entry.config.smokeRate;
        const kind =
            entry.meta.fireSeverity === "critical" ? "smoke" : "smokeLight";
        for (let i = 0; i < (entry.meta.fireSeverity === "critical" ? 2 : 1); i++) {
            spawnParticle(
                entry,
                kind,
                new THREE.Vector3(
                    center.x + (Math.random() - 0.5) * 1.2,
                    roofY + 0.3,
                    center.z + (Math.random() - 0.5) * 1.2,
                ),
                new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    1.2 + Math.random() * 0.8,
                    (Math.random() - 0.5) * 0.4,
                ),
                2 + Math.random() * 1.5,
            );
        }
    }

    if (entry.sparkTimer <= 0) {
        entry.sparkTimer = 0.15 + Math.random() * 0.25;
        if (Math.random() < 0.65) {
            spawnParticle(
                entry,
                "spark",
                new THREE.Vector3(
                    center.x + (Math.random() - 0.5) * 1.5,
                    roofY + 0.2,
                    center.z + (Math.random() - 0.5) * 1.5,
                ),
                new THREE.Vector3(
                    (Math.random() - 0.5) * 1.5,
                    1.5 + Math.random() * 2,
                    (Math.random() - 0.5) * 1.5,
                ),
                0.35 + Math.random() * 0.25,
            );
        }
    }
}

function updateParticles(entry, delta) {
    for (const p of entry.particles) {
        if (!p.active) continue;
        p.life -= delta;
        p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));

        if (p.kind === "spark") {
            p.velocity.y -= delta * 4;
            p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
        } else {
            p.velocity.y += delta * 0.35;
            p.velocity.x += (Math.random() - 0.5) * delta * 0.2;
            p.mesh.material.opacity =
                Math.max(0, p.life / p.maxLife) *
                (p.kind === "smoke" ? 0.55 : 0.35);
            p.mesh.scale.setScalar(1 + (p.maxLife - p.life) * 0.8);
            p.mesh.rotation.z += delta * 0.5;
        }

        if (p.life <= 0) {
            p.active = false;
            p.mesh.visible = false;
        }
    }
    entry.particles = entry.particles.filter((p) => p.active);
}

function animateWatchers(entry, delta) {
    for (const watcher of entry.watchers) {
        watcher.rotation.y = Math.sin(entry.pulsePhase + watcher.id) * 0.15;
        watcher.position.y = 0.45 + Math.sin(entry.pulsePhase * 2) * 0.03;
    }
    for (const truck of entry.trucks) {
        truck.children[truck.children.length - 1].rotation.y += delta * 6;
    }
}

export function updateFireBuildings(delta) {
    if (!fireGroup) return;

    for (const entry of getAllFireBuildings()) {
        animateFlames(entry, delta);
        animateBeacon(entry, delta);
        animateHeat(entry, delta);
        emitSmokeAndSparks(entry, delta);
        updateParticles(entry, delta);
        animateWatchers(entry, delta);
    }
}

export function clearFireBuildings() {
    for (const buildingId of [...buildingGlowRestore.keys()]) {
        restoreBuildingGlow(buildingId);
    }

    for (const p of particlePool) {
        p.active = false;
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    }
    particlePool = [];

    clearFireRegistry();

    if (fireGroup && sceneRef) {
        sceneRef.remove(fireGroup);
        fireGroup = null;
    }
}

export function getFireBuildingMeta(buildingId) {
    const entry = getAllFireBuildings().find(
        (e) => e.buildingId === buildingId,
    );
    return entry?.meta || null;
}

export function repairFireBuilding(buildingId) {
    const entry = getAllFireBuildings().find(
        (e) => e.buildingId === buildingId,
    );
    if (!entry) return false;

    restoreBuildingGlow(buildingId);

    for (const p of entry.particles || []) {
        p.active = false;
        if (p.mesh?.parent) p.mesh.parent.remove(p.mesh);
    }

    if (entry.group?.parent) {
        entry.group.parent.remove(entry.group);
    }

    entry.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose?.();
        if (child.material) {
            const mats = Array.isArray(child.material)
                ? child.material
                : [child.material];
            for (const m of mats) m.dispose?.();
        }
    });

    removeFireBuilding(buildingId);
    return true;
}
