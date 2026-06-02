/**
 * GLB asset URL resolution and resilient loading for Vite + static hosting (Vercel).
 *
 * Models are served from public/assets/ → /assets/{filename} at runtime.
 * Failed loads retry with default building parts so one 404 cannot break the city.
 */

/** Default 1×1 building parts used when a referenced GLB is missing. */
export const FALLBACK_BUILDING = {
    ground: "building_1x1_0_g.glb",
    floor: "building_1x1_0_f.glb",
    roof: "building_1x1_0_r.glb",
};

export const FALLBACK_ROAD = "road0.glb";
export const FALLBACK_TREE = "tree_small_0.glb";
export const FALLBACK_GRASS = "grass.glb";

/** @type {Map<string, Promise<import('three/examples/jsm/loaders/GLTFLoader').GLTF>} */
const loadPromises = new Map();

/** Log each missing filename once per session. */
const warnedMissing = new Set();

/**
 * Build a URL for files in public/assets/.
 * Works with base: "./" (GitHub Pages) and "/" (Vercel root deploy).
 *
 * @param {string} filename
 */
export function resolveAssetUrl(filename) {
    if (!filename) return "";
    const base = import.meta.env.BASE_URL || "/";
    const prefix = base.endsWith("/") ? base : `${base}/`;
    return `${prefix}assets/${filename}`;
}

/**
 * @param {string} filename
 * @param {{ category?: string, part?: string, buildingType?: number, requestedFile?: string }} [context]
 */
export function pickFallbackAsset(filename, context = {}) {
    if (!filename) return null;

    const { category = "unknown", part = "ground" } = context;

    if (
        filename === FALLBACK_BUILDING.ground ||
        filename === FALLBACK_BUILDING.floor ||
        filename === FALLBACK_BUILDING.roof ||
        filename === FALLBACK_ROAD ||
        filename === FALLBACK_TREE ||
        filename === FALLBACK_GRASS
    ) {
        return null;
    }

    if (category === "building") {
        if (part === "roof") return FALLBACK_BUILDING.roof;
        if (part === "floor") return FALLBACK_BUILDING.floor;
        return FALLBACK_BUILDING.ground;
    }
    if (category === "road") return FALLBACK_ROAD;
    if (category === "tree") return FALLBACK_TREE;
    if (category === "grass") return FALLBACK_GRASS;
    if (category === "environment") return null;

    return FALLBACK_BUILDING.ground;
}

/**
 * @param {string} missingFile
 * @param {string} fallbackFile
 * @param {{ category?: string, part?: string, buildingType?: number }} context
 */
function logMissingAsset(missingFile, fallbackFile, context) {
    if (warnedMissing.has(missingFile)) return;
    warnedMissing.add(missingFile);

    const typeLabel =
        context.buildingType != null
            ? `building type ${context.buildingType}`
            : context.category || "asset";

    console.warn(
        `[GitHub City] Missing GLB "${missingFile}" (${typeLabel}, part: ${
            context.part || "n/a"
        }). Using fallback "${fallbackFile}".`,
    );
}

/**
 * Load a GLTF/GLB with in-memory deduplication and automatic fallback.
 *
 * @param {import('three/examples/jsm/loaders/GLTFLoader').GLTFLoader} loader
 * @param {string} filename
 * @param {{ category?: string, part?: string, buildingType?: number }} [context]
 * @param {number} [depth]
 * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader').GLTF>}
 */
export function loadGltfAsset(loader, filename, context = {}, depth = 0) {
    const url = resolveAssetUrl(filename);

    if (!loadPromises.has(url)) {
        loadPromises.set(
            url,
            new Promise((resolve, reject) => {
                loader.load(
                    url,
                    (gltf) => resolve(gltf),
                    undefined,
                    (error) => reject(error),
                );
            }),
        );
    }

    return loadPromises.get(url).catch((error) => {
        loadPromises.delete(url);

        const fallback = pickFallbackAsset(filename, context);
        if (fallback && fallback !== filename && depth < 4) {
            logMissingAsset(filename, fallback, context);
            return loadGltfAsset(
                loader,
                fallback,
                { ...context, requestedFile: filename },
                depth + 1,
            );
        }

        console.warn(
            `[GitHub City] Could not load "${filename}" and no fallback available.`,
            error,
        );
        return Promise.reject(error);
    });
}

/**
 * Clone a loaded GLTF scene for instancing on multiple tiles.
 * Materials are cloned so per-building selection/highlight never affects neighbors.
 *
 * @param {import('three/examples/jsm/loaders/GLTFLoader').GLTF} gltf
 */
export function cloneGltfScene(gltf) {
    const root = gltf.scene.clone(true);
    root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => m.clone());
        } else {
            child.material = child.material.clone();
        }
    });
    return root;
}

/**
 * Clear loader cache (e.g. when returning to landing).
 */
export function clearAssetLoaderCache() {
    loadPromises.clear();
    warnedMissing.clear();
}
