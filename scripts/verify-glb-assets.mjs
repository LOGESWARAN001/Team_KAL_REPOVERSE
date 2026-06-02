/**
 * Verifies every GLB referenced in constants.js exists under public/assets/.
 * Run after moving assets: node scripts/verify-glb-assets.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
    BUILDING_TYPES,
    ENVIRONMENT_ANIMATED_ASSET,
    ENVIRONMENT_ASSET,
    ENVIRONMENT_OBJECTS_ASSET,
    GRASS_ASSET,
    ROAD_TYPES,
    TREES_SMALL,
} from "../constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "..", "public", "assets");

function collectReferenced() {
    const names = new Set();

    for (const variants of Object.values(BUILDING_TYPES)) {
        for (const def of variants) {
            if (def.groundUrl) names.add(def.groundUrl);
            if (def.floorUrl) names.add(def.floorUrl);
            if (def.roofUrl) names.add(def.roofUrl);
        }
    }

    for (const road of Object.values(ROAD_TYPES)) names.add(road);
    for (const tree of TREES_SMALL) names.add(tree);
    names.add(GRASS_ASSET);
    names.add(ENVIRONMENT_ASSET);
    names.add(ENVIRONMENT_OBJECTS_ASSET);
    names.add(ENVIRONMENT_ANIMATED_ASSET);

    return [...names].sort();
}

function listOnDisk() {
    if (!fs.existsSync(assetsDir)) return [];
    return fs
        .readdirSync(assetsDir)
        .filter((f) => f.toLowerCase().endsWith(".glb"))
        .sort();
}

const referenced = collectReferenced();
const onDisk = new Set(listOnDisk());
const onDiskList = listOnDisk();

const missing = referenced.filter((f) => !onDisk.has(f));
const unreferenced = onDiskList.filter((f) => !referenced.includes(f));

console.log(`Assets directory: ${assetsDir}`);
console.log(`Referenced GLBs: ${referenced.length}`);
console.log(`On disk: ${onDiskList.length}`);

if (missing.length) {
    console.error("\nMissing (referenced but not on disk):");
    for (const f of missing) console.error(`  - ${f}`);
}

if (unreferenced.length) {
    console.log("\nUnreferenced (on disk, not in constants):");
    for (const f of unreferenced) console.log(`  - ${f}`);
}

if (missing.length) {
    process.exit(1);
}

console.log("\nAll referenced GLB files are present.");
