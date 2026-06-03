/*
 *  Things that handle all the 3D stuff
 */

import { EffectComposer, RenderPass } from "postprocessing";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

import { cloneGltfScene, loadGltfAsset } from "./assetLoader.js";
import { registerBuildingMesh } from "./buildingRegistry.js";
import { updateCityRewards } from "./cityRewards.js";
import {
    ENVIRONMENT_ANIMATED_ASSET,
    ENVIRONMENT_ASSET,
    ENVIRONMENT_OBJECTS_ASSET,
    FLOOR_HEIGHT,
    GRASS_ASSET,
    ROAD_TYPES,
    TREES_SMALL,
} from "./constants";
import { updateFireBuildings } from "./fireBuildings.js";

// Global GLTF loader
const loader = new GLTFLoader();

export function createScene() {
    // Create scene
    const scene = new THREE.Scene();
    const camera = createCamera();
    const renderer = createRenderer(scene, camera);

    setupLighting(scene);

    const updateMixer = setupEnvironment(scene);

    const controls = createControls(camera, renderer);

    const composer = setupPostProcessing(scene, camera, renderer);

    const clock = new THREE.Clock();

    // Animation loop
    function animate() {
        const delta = clock.getDelta();

        requestAnimationFrame(animate);
        controls.update();
        updateMixer(delta);
        updateFireBuildings(delta);
        updateCityRewards(delta);
        composer.render();
    }
    animate();

    // Resize renderer when window size changes
    window.onresize = () => {
        resizeRenderer(renderer);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    };

    return { scene, controls, camera, renderer };
}

export function clearScene(scene) {
    const toDelete = ["Building", "Road", "Grass", "Tree", "FireBuilding"];
    for (let i = scene.children.length - 1; i >= 0; i--) {
        if (toDelete.includes(scene.children[i].name))
            scene.remove(scene.children[i]);
    }
}

const SHADOW_MAP_SIZES = [768, 1536, 2048];

export function changeShadowPreset(scene, preset) {
    const presetIndex =
        typeof preset === "string" ? parseInt(preset, 10) : preset;
    const size =
        SHADOW_MAP_SIZES[
            Math.min(SHADOW_MAP_SIZES.length, Math.max(1, presetIndex)) - 1
        ];

    for (const child of scene.children) {
        if (child.type !== "DirectionalLight") continue;

        child.shadow.mapSize.set(size, size);
        if (child.shadow.map) {
            child.shadow.map.dispose();
            child.shadow.map = null;
        }
        child.shadow.needsUpdate = true;
    }
}

// Set shadows on given object to given settings
function setShadow(obj, cast = false, receive = false) {
    obj.castShadow = cast;
    obj.receiveShadow = receive;
    if (obj?.children != null) {
        for (const child of obj.children) {
            setShadow(child, cast, receive);
        }
    }
}

function buildingPartName(floorIndex, totalHeight) {
    if (floorIndex === 0) return "ground";
    if (floorIndex === totalHeight - 1) return "roof";
    return "floor";
}

export function renderBuilding(x, y, z, building, scene) {
    const height = Math.min(building.value, 35); // Cap height
    for (let i = 0; i < height; i++) {
        let assetToLoad = "";
        if (i === 0)
            assetToLoad = building.building.groundUrl; // Load ground tile
        else if (i === height - 1)
            assetToLoad = building.building.roofUrl; // Load roof tile
        else assetToLoad = building.building.floorUrl; // Load floor tile
        if (assetToLoad == null || assetToLoad === "") continue;

        const part = buildingPartName(i, height);

        loadGltfAsset(loader, assetToLoad, {
            category: "building",
            part,
            buildingType: building.type,
        })
            .then((gltf) => {
                const isLShaped = building.type === 2;
                let extraShiftZ = 0;
                let extraShiftX = 0;
                if (isLShaped && building.dir === 1) {
                    extraShiftZ = 2;
                    extraShiftX = 2;
                }
                let extraAngle = 0;

                const root = cloneGltfScene(gltf);
                setShadow(root, true, false);

                root.name = "Building";
                if (building.fileMeta) {
                    const meta = { ...building.fileMeta, isBuilding: true };
                    root.userData = meta;
                    registerBuildingMesh(meta.buildingId, meta, root);
                }
                if (building.mirror) {
                    root.scale.z *= -1; // mirror the object
                    extraAngle = 270; // add extra angle to compensate shift from mirroring
                }

                root.position.y = y + i * FLOOR_HEIGHT * 2;
                root.position.x = x + extraShiftX;
                root.position.z = z + extraShiftZ;

                root.rotation.y = THREE.Math.degToRad(
                    -90 * (building.dir + (isLShaped ? 2 : 0)) - extraAngle,
                );

                scene.add(root);
            })
            .catch(() => {
                /* Warning logged in assetLoader; skip this floor part */
            });
    }
}

export function renderRoad(x, y, z, road, scene) {
    let assetToLoad = "";
    if (road.type === 0) assetToLoad = ROAD_TYPES[0]; // 2 way road
    else if (road.type === 1) assetToLoad = ROAD_TYPES[1]; // 3 way road
    else if (road.type === 2) assetToLoad = ROAD_TYPES[2]; // 4 way road
    else if (road.type === 3) assetToLoad = ROAD_TYPES[3]; // 2 way turn
    if (assetToLoad == null || assetToLoad === "") return;

    loadGltfAsset(loader, assetToLoad, {
        category: "road",
        buildingType: road.type,
    })
        .then((gltf) => {
            const root = cloneGltfScene(gltf);
            root.position.y = y;
            root.position.x = x;
            root.position.z = z;
            root.rotation.y = THREE.Math.degToRad(-90 * road.dir);

            setShadow(root, false, true);

            root.name = "Road";
            scene.add(root);
        })
        .catch(() => {});
}

export function renderGrass(x, y, z, scene) {
    loadGltfAsset(loader, GRASS_ASSET, { category: "grass" })
        .then((gltf) => {
            const root = cloneGltfScene(gltf);
            root.position.y = y;
            root.position.x = x;
            root.position.z = z;

            setShadow(root, false, true);

            root.name = "Grass";
            scene.add(root);
        })
        .catch(() => {});

    // Create a tree somewhere on the tile
    for (const i of [-0.7, 0.7]) {
        const treeAsset =
            TREES_SMALL[Math.floor(TREES_SMALL.length * Math.random())];
        loadGltfAsset(loader, treeAsset, { category: "tree" })
            .then((gltf) => {
                const root = cloneGltfScene(gltf);
                root.position.x = x + Math.random() * i;
                root.position.y = y;
                root.position.z = z + Math.random() * i;

                setShadow(root, true, false);

                root.name = "Tree";
                scene.add(root);
            })
            .catch(() => {});
    }
}

// Convert given scene into STL blob
export function convertSceneToStlBlob(scene) {
    const exporter = new STLExporter();
    const str = exporter.parse(scene);
    return new Blob([str], { type: "text/plain" });
}

// Create and cofigure camera and return it
function createCamera() {
    const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        400,
    );
    camera.position.set(0, 30, 51);

    return camera;
}

// Create and configure renderer and return it
function createRenderer(scene, camera) {
    const renderer = new THREE.WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true,
        depth: true,
        canvas: document.querySelector("#bg"),
    });

    resizeRenderer(renderer);

    renderer.render(scene, camera);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    return renderer;
}

// Set's the renderers size to current window size
function resizeRenderer(renderer) {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Create and configure controls and return it
function createControls(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = -1;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.minDistance = 30;
    controls.maxDistance = 150;

    return controls;
}

// Configure postprocessing and return composer
function setupPostProcessing(scene, camera, renderer) {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    return composer;
}

// Create and configure lighting in the scene
function setupLighting(scene) {
    // Ambient lighting
    const ambientLight = new THREE.AmbientLight(0x9ad0ec, 0.7);
    // const ambientLight = new THREE.AmbientLight(0x9AD0EC, 1);
    scene.add(ambientLight);

    // Directional lighting and shadows
    const directionLight = new THREE.DirectionalLight(0xe9b37c);
    directionLight.position.set(-50, 50, -20);
    directionLight.castShadow = true;
    directionLight.shadow.mapSize.x = 768;
    directionLight.shadow.mapSize.y = 768;
    directionLight.shadow.camera.near = 15;
    directionLight.shadow.camera.far = 150.0;
    directionLight.shadow.camera.right = 75;
    directionLight.shadow.camera.left = -75;
    directionLight.shadow.camera.top = 75;
    directionLight.shadow.camera.bottom = -75;
    scene.add(directionLight);
}

// Create and setup anything environment-related
function setupEnvironment(scene) {
    const sceneBackground = new THREE.Color(0x9ad0ec);
    scene.background = sceneBackground;

    const position = new THREE.Vector3(0, -4, 0);

    // Render environment (ground)
    loadGltfAsset(loader, ENVIRONMENT_ASSET, {
        category: "environment",
        part: "base",
    })
        .then((gltf) => {
            const env = cloneGltfScene(gltf);
            env.position.set(...position);
            setShadow(env, false, true);
            scene.add(env);
        })
        .catch(() => {});

    // Render environment (objects and other stuff)
    loadGltfAsset(loader, ENVIRONMENT_OBJECTS_ASSET, {
        category: "environment",
        part: "objects",
    })
        .then((gltf) => {
            const envObjects = cloneGltfScene(gltf);
            envObjects.position.set(...position);
            setShadow(envObjects, true, false);
            scene.add(envObjects);
        })
        .catch(() => {});

    // Render and animate animated environment
    let mixer;
    const updateMixer = (delta) => {
        if (mixer) mixer.update(delta);
    };

    loadGltfAsset(loader, ENVIRONMENT_ANIMATED_ASSET, {
        category: "environment",
        part: "animated",
    })
        .then((gltf) => {
            const envAnimated = cloneGltfScene(gltf);
            envAnimated.position.set(...position);
            setShadow(envAnimated, true, false);

            // Setup animation mixer and play all animations
            mixer = new THREE.AnimationMixer(envAnimated);
            const clips = gltf.animations;

            clips.forEach(function (clip) {
                mixer.clipAction(clip).play();
            });

            scene.add(envAnimated);
        })
        .catch(() => {});

    return updateMixer;
}
