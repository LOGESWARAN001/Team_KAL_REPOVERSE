/**
 * Fire Building effects — cartoon CI failure visualization.
 */

import * as THREE from "three";

import { getEnrichedBuildingMeta } from "./buildingIndex.js";
import { computeBuildingRoofAnchor, getBuilding } from "./buildingRegistry.js";
import {
    logFireActivated,
    logFireSkipped,
    logIssueVisualization,
} from "./cityDiagnostics.js";
import {
    clearFireRegistry,
    getAllFireBuildings,
    getFireBuilding,
    registerFireBuilding,
    removeFireBuilding,
} from "./fireRegistry.js";
import { shouldSpawnFireForMeta } from "./repoHealthAnalysis.js";

const FIRE_ORANGE = 0xff6b35;
const FIRE_YELLOW = 0xffd166;
const WARN_RED = 0xff2d2d;
const SMOKE_DARK = 0x2d2d2d;

const SEVERITY_CONFIG = {
    minor: {
        smokeRate: 0.35,
        flameCount: 2,
        smokeHeight: 4,
    },
    medium: {
        smokeRate: 0.7,
        flameCount: 4,
        smokeHeight: 7,
    },
    high: {
        smokeRate: 0.95,
        flameCount: 5,
        smokeHeight: 9,
    },
    critical: {
        smokeRate: 1.2,
        flameCount: 6,
        smokeHeight: 12,
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

function createHologramSprite(meta) {
    console.log(meta, "meta");
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(255,45,45,0.85)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 22px Inter, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(
        `⚠ ${(meta?.primaryIssue?.type || "Unknown issue")?.toUpperCase()}`,
        128,
        40,
    );

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
        p = {
            mesh,
            active: false,
            kind,
            life: 0,
            maxLife: 1,
            velocity: new THREE.Vector3(),
        };
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

function placeFireOnRoof(entry) {
    const anchor = computeBuildingRoofAnchor(entry.buildingId);
    if (!anchor) return false;

    const { center, roofY, size, footprint, box } = anchor;
    const spread = footprint * 0.22 + 0.12;

    entry.bounds = { center, size, box, roofY, footprint };

    for (let i = 0; i < entry.flames.length; i++) {
        const flame = entry.flames[i];
        const angle = (i / entry.flames.length) * Math.PI * 2;
        flame.position.set(
            center.x + Math.cos(angle) * spread,
            roofY + 0.2,
            center.z + Math.sin(angle) * spread,
        );
    }

    entry.beacon.position.set(center.x, roofY + 0.55, center.z);
    entry.hologram.position.set(
        center.x,
        roofY + entry.config.smokeHeight * 0.35,
        center.z,
    );
    entry.heat.position.set(center.x, roofY + 0.12, center.z);

    return true;
}

function purgeInvalidFires() {
    for (const entry of getAllFireBuildings()) {
        if (!shouldSpawnFireForMeta(entry.meta)) {
            repairFireBuilding(entry.buildingId);
            continue;
        }
        if (!computeBuildingRoofAnchor(entry.buildingId)) {
            repairFireBuilding(entry.buildingId);
        }
    }
}

export function setupFireBuilding(meta) {
    if (!fireGroup) return null;
    initSharedResources();

    const buildingId = meta.buildingId;
    if (!shouldSpawnFireForMeta(meta)) return null;

    const anchor = computeBuildingRoofAnchor(buildingId);
    if (!anchor) return null;

    const severity = meta.fireSeverity || meta.severityLabel || "medium";
    const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;

    const group = new THREE.Group();
    group.name = "FireBuilding";

    const flames = [];
    for (let i = 0; i < config.flameCount; i++) {
        const flame = createFlameMesh();
        flame.userData.phase = Math.random() * Math.PI * 2;
        flames.push(flame);
        group.add(flame);
    }

    const beacon = new THREE.Mesh(
        sharedGeometries.beacon,
        sharedMaterials.beacon,
    );
    group.add(beacon);

    const hologram = createHologramSprite(meta);
    group.add(hologram);

    const heat = new THREE.Mesh(sharedGeometries.heat, sharedMaterials.heat);
    heat.rotation.x = -Math.PI / 2;
    group.add(heat);

    applyBuildingFireGlow(buildingId, severity === "critical" ? 0.12 : 0.06);

    const entry = {
        buildingId,
        meta,
        group,
        flames,
        beacon,
        hologram,
        heat,
        particles: [],
        config,
        bounds: null,
        pulsePhase: Math.random() * Math.PI * 2,
        sparkTimer: 0,
        smokeTimer: 0,
    };

    if (!placeFireOnRoof(entry)) {
        restoreBuildingGlow(buildingId);
        return null;
    }

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

    purgeInvalidFires();

    const candidates = [];
    const seen = new Set();

    const consider = (raw) => {
        const meta = getEnrichedBuildingMeta(raw);
        if (!meta?.buildingId || seen.has(meta.buildingId)) return;
        if (!shouldSpawnFireForMeta(meta)) {
            logFireSkipped({
                buildingId: meta.buildingId,
                fileName: meta.fileName,
                filePath: meta.filePath || meta.path,
                issueCount: meta.issueCount || 0,
                buildFailed: !!meta.buildFailed,
                hasBug: !!meta.hasBug,
                severity: meta.severityLabel,
                fireTrigger: false,
                reason: meta.repaired
                    ? "Building repaired"
                    : "No syntax issues on building",
            });
            return;
        }
        seen.add(meta.buildingId);
        candidates.push(meta);
    };

    for (const row of fileMetaGrid || []) {
        for (const cell of row) {
            consider(cell);
        }
    }

    for (const file of explorerFiles) {
        consider(file);
    }

    if (candidates.length === 0) return;

    let spawned = 0;
    for (const meta of candidates) {
        if (getFireBuilding(meta.buildingId)) continue;
        if (computeBuildingRoofAnchor(meta.buildingId)) {
            setupFireBuilding(meta);
            spawned++;
            logFireActivated({
                buildingId: meta.buildingId,
                fileName: meta.fileName,
                filePath: meta.filePath || meta.path,
                issueCount: meta.issueCount || 0,
                fireActive: true,
                buildFailed: !!meta.buildFailed,
                severity: meta.fireSeverity || meta.severityLabel,
            });
            logIssueVisualization({
                filePath: meta.filePath || meta.path,
                issuesFound: meta.issueCount || 0,
                severity: meta.severityLabel || meta.fireSeverity,
                mappedBuilding: meta.buildingId,
                fireTrigger: true,
                bugIndicator: false,
                healthScore: meta.healthScore,
            });
        }
    }

    if (spawned === 0 && attempt < 80) {
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
        flame.scale.set(
            s,
            0.85 + Math.sin(flame.userData.phase * 1.3) * 0.3,
            s,
        );
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
    entry.beacon.material.emissiveIntensity = 0.35 + pulse * 0.35;

    if (entry.meta.fireSeverity === "critical") {
        entry.hologram.material.opacity =
            0.75 + Math.sin(entry.pulsePhase * 5) * 0.25;
    }
}

function animateHeat(entry, delta) {
    entry.heat.material.opacity = 0.04 + Math.sin(entry.pulsePhase * 4) * 0.03;
    entry.heat.scale.x = 1 + Math.sin(entry.pulsePhase * 2) * 0.15;
    entry.heat.rotation.z += delta * 0.5;
}

function emitSmokeAndSparks(entry, delta) {
    entry.smokeTimer -= delta;
    entry.sparkTimer -= delta;

    if (!entry.bounds?.center) return;
    const { center, roofY, footprint } = entry.bounds;
    const spread = (footprint || 1) * 0.35;

    if (entry.smokeTimer <= 0) {
        entry.smokeTimer = 0.08 / entry.config.smokeRate;
        const kind =
            entry.meta.fireSeverity === "critical" ? "smoke" : "smokeLight";
        for (
            let i = 0;
            i < (entry.meta.fireSeverity === "critical" ? 2 : 1);
            i++
        ) {
            spawnParticle(
                entry,
                kind,
                new THREE.Vector3(
                    center.x + (Math.random() - 0.5) * spread,
                    roofY + 0.35,
                    center.z + (Math.random() - 0.5) * spread,
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
                    center.x + (Math.random() - 0.5) * spread,
                    roofY + 0.25,
                    center.z + (Math.random() - 0.5) * spread,
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

export function updateFireBuildings(delta) {
    if (!fireGroup) return;

    for (const entry of getAllFireBuildings()) {
        if (!shouldSpawnFireForMeta(entry.meta)) {
            repairFireBuilding(entry.buildingId);
            continue;
        }
        if (!placeFireOnRoof(entry)) continue;

        animateFlames(entry, delta);
        animateBeacon(entry, delta);
        animateHeat(entry, delta);
        emitSmokeAndSparks(entry, delta);
        updateParticles(entry, delta);
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
