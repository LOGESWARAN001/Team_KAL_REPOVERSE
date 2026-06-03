import * as THREE from "three";

import { findTiles, getTileTypes, initializeTiles } from "./algo";
import {
    clearRepoCache,
    fetchRepository,
    getFetchErrorMessage,
    getRepositoryCityData,
} from "./api";
import { clearAssetLoaderCache } from "./assetLoader.js";
import { clearBuildingRegistry } from "./buildingRegistry";
import {
    clearBuildingSelection,
    initBuildingSelection,
    selectBuildingById,
    selectBuildingFromObject,
    setOnSelectionChange,
} from "./buildingSelection";
import {
    hideBuildStatusPanel,
    initBuildStatusPanel,
    isIssueBuilding,
    showBuildStatusPanel,
} from "./buildStatusPanel.js";
import { applyCiFailuresToCity, fetchCiFailureData } from "./ciAnalysis.js";
import { clearCityRewards, initCityRewards } from "./cityRewards.js";
import { CityStatsPanel } from "./cityStatsPanel";
import {
    clearFireBuildings,
    initFireBuildings,
    spawnFireBuildings,
} from "./fireBuildings.js";
import { setGithubToken } from "./githubAuth.js";
import { resetHeroProgress } from "./heroProgress.js";
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
import { initMissionControl } from "./missionControl.js";
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
const githubTokenInput = document.getElementById("githubTokenInput");
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
initFireBuildings(scene);
initBuildStatusPanel();
initCityRewards(scene);
initMissionControl({
    onComplete: (meta) => {
        if (meta?.buildingId) {
            selectBuildingById(meta.buildingId, {
                force: true,
                focusCamera: false,
            });
        }
    },
});

setOnSelectionChange((meta) => {
    if (meta) {
        repositoryExplorer.showFileDetails(meta);
        repositoryExplorer.selectBuildingId(meta.buildingId);
        if (isIssueBuilding(meta)) {
            showBuildStatusPanel(meta);
        } else {
            hideBuildStatusPanel();
        }
        if (!repositoryExplorer.panel.classList.contains("open")) {
            repositoryExplorer.openPanel();
        }
    } else {
        hideBuildStatusPanel();
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
    errorMessage.textContent =
        "Could not load that repository. Check the URL and try again.";
    cityStatsPanel.hide();
    hideBuildingInfo();
    hideBuildStatusPanel();
    clearCityRewards();
    resetHeroProgress();
    clearFireBuildings();
    clearBuildingSelection();
    clearFireBuildings();
    repositoryExplorer.hide();
    cityGenerated = false;
    clearScene(scene);
    clearAssetLoaderCache();
    enteredInfo = false;
    enterLandingMode();
}

infoForm.onsubmit = async (e) => {
    e.preventDefault();
    const repo = repoInput.value.trim();
    if (!repo) return;
    if (githubTokenInput) {
        setGithubToken(githubTokenInput.value);
    }
    clearRepoCache();
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
    let ciContext = null;
    try {
        setLoaderStep(0);
        repoResult = await fetchRepository(repoInputValue);
        setLoaderStep(1);
        await delay(350);

        if (repoResult?.error || repoResult == null) {
            hideLandingLoader();
            errorMessage.textContent = getFetchErrorMessage(repoResult);
            errorMessage.style.display = "block";
            if (repoResult?.error === "rate_limit") {
                const tokenDetails = document.querySelector(
                    ".landing-token-details",
                );
                if (tokenDetails) tokenDetails.open = true;
            }
            return;
        }

        setLoaderStep(2);
        ciContext = await fetchCiFailureData(
            repoResult.stats.owner,
            repoResult.stats.repo,
            repoResult.defaultBranch || "main",
        );
        await delay(400);
        setLoaderStep(3);
        await delay(400);
    } catch (err) {
        hideLandingLoader();
        errorMessage.textContent =
            err?.message ||
            "Could not load that repository. Check the URL and try again.";
        errorMessage.style.display = "block";
        return;
    }

    const { contribs, heightGrid, fileMetaGrid, explorerFiles, stats } =
        getRepositoryCityData(repoResult);
    if (!ciContext) {
        ciContext = await fetchCiFailureData(
            stats.owner,
            stats.repo,
            repoResult.defaultBranch || "main",
        );
    }
    const {
        fileMetaGrid: enrichedMetaGrid,
        explorerFiles: enrichedExplorerFiles,
    } = applyCiFailuresToCity(fileMetaGrid, explorerFiles, ciContext);
    currentRepoName = repoResult.fullName;

    setLoaderStep(4);
    await delay(450);

    exitLandingMode();
    hideLandingLoader();

    selectionScreen.classList.add("hidden");
    displayInfo.innerHTML = `<span>${stats.owner}/${stats.repo}</span>`;
    updateCityStats(stats);

    generateCity(contribs, {
        heightGrid,
        fileMetaGrid: enrichedMetaGrid,
    });
    initFireBuildings(scene);
    spawnFireBuildings(enrichedMetaGrid, enrichedExplorerFiles);
    repositoryExplorer.setFiles(enrichedExplorerFiles, currentRepoName);
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
        if (meta) return;
    }
    clearBuildingSelection();
    hideBuildingInfo();
    hideBuildStatusPanel();
    repositoryExplorer.clearFileDetails();
}

function generateCity(contribs, options = {}) {
    clearScene(scene);
    clearFireBuildings();
    clearCityRewards();
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
