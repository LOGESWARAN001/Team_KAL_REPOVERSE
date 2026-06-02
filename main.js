import * as THREE from "three";

import { findTiles, getTileTypes, initializeTiles } from "./algo";
import { fetchRepository, getRepositoryCityData } from "./api";
import { clearBuildingRegistry } from "./buildingRegistry";
import {
    clearBuildingSelection,
    initBuildingSelection,
    selectBuildingById,
    selectBuildingFromObject,
    setOnSelectionChange,
} from "./buildingSelection";
import { CityStatsPanel } from "./cityStatsPanel";
import {
    enterLandingMode,
    exitLandingMode,
    initLandingExperience,
} from "./landing.js";
import {
    hideLandingLoader,
    setLoaderStep,
    showLandingLoader,
} from "./landingLoader.js";
import { RepositoryExplorer } from "./repositoryExplorer";
import {
    changeShadowPreset,
    clearScene,
    createScene,
    renderBuilding,
    renderGrass,
    renderRoad,
} from "./scene";

const repoInput = document.getElementById("repoInput");
const infoForm = document.getElementById("infoForm");
const selectionScreen = document.getElementById("selectionScreen");
const titleLink = document.getElementById("title");
const landingTitleLink = document.getElementById("landingTitle");
const displayInfo = document.getElementById("displayInfo");
const errorMessage = document.getElementById("errorMessage");
const shadowPreset = document.getElementById("shadowPreset");
const cityStatsEl = document.getElementById("cityStats");
const buildingInfo = document.getElementById("buildingInfo");
const repoExplorerEl = document.getElementById("repoExplorer");

const cityStatsPanel = new CityStatsPanel(cityStatsEl);

const urlParams = new URLSearchParams(window.location.search);

const { scene, controls, camera, renderer } = createScene();
const renderShiftZ = 0.38;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const repositoryExplorer = new RepositoryExplorer(repoExplorerEl);

let currentRepoName = "";
let cityGenerated = false;
let enteredInfo = false;

initBuildingSelection(scene, camera, controls);

setOnSelectionChange((meta) => {
    if (meta) {
        repositoryExplorer.showFileDetails(meta);
        repositoryExplorer.selectBuildingId(meta.buildingId);
        if (!repositoryExplorer.panel.classList.contains("open")) {
            repositoryExplorer.openPanel();
        }
    } else {
        repositoryExplorer.clearFileDetails();
        repositoryExplorer.selectBuildingId(null);
    }
});

repositoryExplorer.setOnFileSelect((file) => {
    if (!file?.buildingId) return;
    selectBuildingById(file.buildingId, { focusCamera: true });
});

if (urlParams.get("repo")) {
    enteredInfo = true;
    repoInput.value = urlParams.get("repo");
    generateCityFromRepo(urlParams.get("repo"));
} else {
    initLandingExperience();
}

function handleTitleClick(e) {
    e.preventDefault();
    if (!selectionScreen.classList.contains("hidden") && enteredInfo) {
        selectionScreen.classList.add("hidden");
    } else {
        returnToLanding();
    }
}

if (titleLink) titleLink.onclick = handleTitleClick;
if (landingTitleLink) landingTitleLink.onclick = handleTitleClick;

function returnToLanding() {
    selectionScreen.classList.remove("hidden");
    controls.autoRotate = true;
    errorMessage.style.display = "none";
    cityStatsPanel.hide();
    hideBuildingInfo();
    clearBuildingSelection();
    repositoryExplorer.hide();
    cityGenerated = false;
    clearScene(scene);
    enteredInfo = false;
    enterLandingMode();
}

infoForm.onsubmit = async (e) => {
    e.preventDefault();
    const repo = repoInput.value.trim();
    if (!repo) return;
    enteredInfo = true;
    const tempArray = window.location.href.split("?");
    const baseURL = tempArray[0];
    const newUrl = `${baseURL}?repo=${encodeURIComponent(repo)}`;
    window.history.replaceState("", "", newUrl);
    await generateCityFromRepo(repo);
};

function applyShadowPreset() {
    if (!shadowPreset) return;
    changeShadowPreset(scene, shadowPreset.value);
}

if (shadowPreset) {
    shadowPreset.addEventListener("input", applyShadowPreset);
    shadowPreset.addEventListener("change", applyShadowPreset);
}

renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateCityFromRepo(repoInputValue) {
    errorMessage.style.display = "none";
    showLandingLoader();
    setLoaderStep(0);

    let repoResult = null;
    try {
        setLoaderStep(0);
        repoResult = await fetchRepository(repoInputValue);
        setLoaderStep(1);
        await delay(350);

        if (repoResult == null) {
            hideLandingLoader();
            errorMessage.style.display = "block";
            return;
        }

        setLoaderStep(2);
        await delay(400);
        setLoaderStep(3);
        await delay(400);
    } catch {
        hideLandingLoader();
        errorMessage.style.display = "block";
        return;
    }

    const { contribs, heightGrid, fileMetaGrid, explorerFiles, stats } =
        getRepositoryCityData(repoResult);
    currentRepoName = repoResult.fullName;

    setLoaderStep(4);
    await delay(450);

    exitLandingMode();
    hideLandingLoader();

    selectionScreen.classList.add("hidden");
    displayInfo.innerHTML = `<span>${stats.owner}/${stats.repo}</span>`;
    updateCityStats(stats);

    generateCity(contribs, { heightGrid, fileMetaGrid });
    repositoryExplorer.setFiles(explorerFiles, currentRepoName);
    cityGenerated = true;
}

function updateCityStats(stats) {
    cityStatsPanel.setStats(stats);
    cityStatsPanel.show();
}

function hideBuildingInfo() {
    if (buildingInfo) {
        buildingInfo.classList.add("hidden");
        buildingInfo.innerHTML = "";
    }
}

function onCanvasPointerDown(event) {
    if (!cityGenerated) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
        const meta = selectBuildingFromObject(hit.object, {
            focusCamera: true,
        });
        if (meta) {
            repositoryExplorer.showFileDetails(meta);
            return;
        }
    }
    clearBuildingSelection();
    hideBuildingInfo();
    repositoryExplorer.clearFileDetails();
}

function generateCity(contribs, options = {}) {
    clearScene(scene);
    clearBuildingRegistry();
    clearBuildingSelection();
    hideBuildingInfo();

    initializeTiles(contribs, options);
    findTiles();
    const tileTypes = getTileTypes();
    const renderShiftX = -Math.floor(tileTypes[0].length / 2);
    const renderShiftY = -Math.floor(tileTypes.length / 2);

    for (let i = 0; i < tileTypes.length; i++) {
        for (let j = 0; j < tileTypes[0].length; j++) {
            const tileType = tileTypes[i][j];
            const x = 2 * (j + renderShiftX) * 1.1;
            const z = 2 * (i + renderShiftY) * 1.1;
            if (tileType.tile === 0) {
                renderGrass(x, 0, z, scene);
            } else if (tileType.tile === 1) {
                renderRoad(x, -0.015, z, tileTypes[i][j], scene);
            } else if (tileType.tile === 2) {
                renderBuilding(x, 2 * renderShiftZ, z, tileTypes[i][j], scene);
            }
        }
    }
}
