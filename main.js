import * as THREE from "three";

import { findTiles, getTileTypes, initializeTiles } from "./algo";
import {
    clearRepoCache,
    fetchRepository,
    getFetchErrorMessage,
    getRepositoryCityData,
} from "./api";
import { clearAssetLoaderCache } from "./assetLoader.js";
import { scanRepoIssuesWithAzure } from "./repoIssueScan.js";
import {
    buildBuildingIndex,
    getEnrichedBuildingMeta,
    normalizeRepoPath,
    resolveBuildingIdByPath,
    resolveFileForBuilding,
    syncRegistryMetaFromIndex,
    validateSelection,
} from "./buildingIndex.js";
import {
    applyEffectsForBuildingMeta,
    ensureBuildingIssueEffects,
    reconcileBuildingIssueEffects,
} from "./buildingIssueEffects.js";
import {
    clearBuildingRegistry,
    setOnBuildingMeshRegistered,
} from "./buildingRegistry";
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
import {
    hideBuildingDebugLabel,
    initCityDebugOverlay,
    setCityDebugSceneRefs,
    showBuildingDebugLabel,
} from "./cityDebugOverlay.js";
import { isCityDebugEnabled, logFileDetected } from "./cityDiagnostics.js";
import { clearCityRewards, initCityRewards } from "./cityRewards.js";
import { CityStatsPanel } from "./cityStatsPanel";
import {
    clearFireBuildings,
    initFireBuildings,
    spawnFireBuildings,
} from "./fireBuildings.js";
import { setGithubToken } from "./githubAuth.js";
import { clearBranchFixRegistry } from "./branchFixRegistry.js";
import {
    reconcileHeroSessionWithScan,
    resetHeroProgress,
} from "./heroProgress.js";
import {
    clearIssueIndicators,
    initIssueIndicators,
    spawnIssueIndicators,
} from "./issueIndicators.js";
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
import {
    initHeroChallengeModal,
    setHeroChallengeRepoContext,
} from "./heroChallengeModal.js";
import { initMissionControl } from "./missionControl.js";
import {
    applyHealthToCity,
    fetchRepoHealthData,
} from "./repoHealthAnalysis.js";
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
setCityDebugSceneRefs(camera, renderer);
const renderShiftZ = 0.38;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const repositoryExplorer = new RepositoryExplorer(repoExplorerEl);

let currentRepoName = "";
let cityGenerated = false;
let enteredInfo = false;

initBuildingSelection(scene, camera, controls);
initFireBuildings(scene);
initIssueIndicators(scene);
setOnBuildingMeshRegistered((meta) => {
    applyEffectsForBuildingMeta(meta);
});
initCityDebugOverlay();
initBuildStatusPanel();
initCityRewards(scene);
const onHeroRepairComplete = (meta) => {
    if (meta?.buildingId) {
        selectBuildingById(meta.buildingId, {
            force: true,
            focusCamera: false,
        });
    }
};

initMissionControl({ onComplete: onHeroRepairComplete });
initHeroChallengeModal({ onComplete: onHeroRepairComplete });

function syncExplorerToBuilding(meta) {
    if (!meta?.buildingId) return;
    const path = normalizeRepoPath(meta.filePath || meta.path);
    repositoryExplorer.showFileDetails(meta);
    repositoryExplorer.selectBuildingById(meta.buildingId, path);
    if (!repositoryExplorer.panel.classList.contains("open")) {
        repositoryExplorer.openPanel();
    }
}

function resolvePanelMeta(meta) {
    if (!meta?.buildingId) return meta;

    const enriched = getEnrichedBuildingMeta(meta);
    const path = normalizeRepoPath(enriched.filePath || enriched.path);
    const file = resolveFileForBuilding(
        repositoryExplorer.files,
        enriched.buildingId,
        path,
    );
    if (!file) return enriched;

    const merged = {
        ...enriched,
        fileName: file.name || enriched.fileName,
        lines: file.lines ?? enriched.lines,
        sizeFormatted: file.sizeFormatted ?? enriched.sizeFormatted,
        language: file.language ?? enriched.language,
    };

    if (!enriched.repaired && !enriched.missionComplete) {
        if (file.hasBug || file.issues?.length) {
            merged.hasBug = Boolean(file.hasBug || merged.hasBug);
            merged.issues = file.issues?.length ? file.issues : merged.issues;
            merged.primaryIssue =
                file.issues?.find((i) => i.type === "syntax") ||
                file.primaryIssue ||
                merged.primaryIssue;
            merged.issueCount = Math.max(
                file.issueCount || 0,
                merged.issueCount || 0,
                merged.issues?.length || 0,
            );
            merged.severityLabel = file.severityLabel || merged.severityLabel;
        }
        if (file.buildFailed && file.buildFailure) {
            merged.buildFailed = true;
            merged.buildFailure = file.buildFailure;
            merged.fireSeverity = file.fireSeverity || merged.fireSeverity;
        }
    }

    return merged;
}

setOnSelectionChange((meta) => {
    if (meta) {
        const panelMeta = resolvePanelMeta(meta);
        if (isCityDebugEnabled()) {
            validateSelection(
                repositoryExplorer.files,
                panelMeta.filePath || panelMeta.path,
                panelMeta.buildingId,
            );
            showBuildingDebugLabel(panelMeta);
        }
        syncExplorerToBuilding(panelMeta);
        if (isIssueBuilding(panelMeta)) {
            showBuildStatusPanel(panelMeta);
            ensureBuildingIssueEffects(panelMeta);
        } else {
            hideBuildStatusPanel();
        }
    } else {
        hideBuildStatusPanel();
        hideBuildingDebugLabel();
        repositoryExplorer.clearFileDetails();
        repositoryExplorer.selectBuildingId(null);
    }
});

repositoryExplorer.setOnFileSelect((file) => {
    const path = normalizeRepoPath(file?.path || file?.filePath);
    if (!path) return;
    const buildingId =
        resolveBuildingIdByPath(path) || file?.buildingId || null;
    if (!buildingId) return;
    if (isCityDebugEnabled()) {
        validateSelection(repositoryExplorer.files, path, buildingId);
    }
    selectBuildingById(buildingId, {
        focusCamera: true,
        force: true,
    });
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
    clearBranchFixRegistry();
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
    // if (!shadowPreset) return;

    changeShadowPreset(scene, 3);
}

if (shadowPreset) {
    shadowPreset.addEventListener("input", applyShadowPreset);
    shadowPreset.addEventListener("change", applyShadowPreset);
}

renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateCityFromRepo(repoInputValue) {
    clearRepoCache();
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
    } = await applyCiFailuresToCity(fileMetaGrid, explorerFiles, ciContext);

    const healthContext = await fetchRepoHealthData(
        stats.owner,
        stats.repo,
        enrichedExplorerFiles,
        repoResult.defaultBranch || "main",
    );
    const { fileMetaGrid: healthMetaGrid, explorerFiles: healthExplorerFiles } =
        applyHealthToCity(
            enrichedMetaGrid,
            enrichedExplorerFiles,
            healthContext,
        );

    buildBuildingIndex(healthExplorerFiles, healthMetaGrid);
    reconcileHeroSessionWithScan(healthExplorerFiles);

    if (isCityDebugEnabled()) {
        for (const file of healthExplorerFiles) {
            if (file.buildingId) logFileDetected(file);
        }
    }

    currentRepoName = repoResult.fullName;
    setHeroChallengeRepoContext({
        owner: stats.owner,
        repo: stats.repo,
        fullName: repoResult.fullName,
        defaultBranch: repoResult.defaultBranch || "main",
    });

    setLoaderStep(4);
    await delay(450);

    exitLandingMode();
    hideLandingLoader();

    selectionScreen.classList.add("hidden");
    displayInfo.innerHTML = `<span>${stats.owner}/${stats.repo}</span>`;
    updateCityStats(stats);

    generateCity(contribs, {
        heightGrid,
        fileMetaGrid: healthMetaGrid,
    });
    buildBuildingIndex(healthExplorerFiles, healthMetaGrid);
    initFireBuildings(scene);
    syncRegistryMetaFromIndex();
    clearIssueIndicators();
    spawnFireBuildings(healthMetaGrid, healthExplorerFiles);
    spawnIssueIndicators(healthMetaGrid, healthExplorerFiles);
    reconcileBuildingIssueEffects(healthMetaGrid, healthExplorerFiles);

    const repoContext = {
        owner: stats.owner,
        repo: stats.repo,
        defaultBranch: repoResult.defaultBranch || "main",
    };

    scanRepoIssuesWithAzure(
        repoContext,
        healthExplorerFiles,
        (done, total, file) => {
            console.log(`[IssueScan] ${done}/${total}: ${file ?? "done"}`);
        },
    )
        .then((scanResults) => {
            // scanResults is a flat array of file meta objects.
            // Wrap as a single row so buildBuildingIndex / spawn fns
            // receive the expected fileMetaGrid shape (array of rows).
            const azureMetaGrid = [scanResults];

            // Rebuild index with AI scan results — hasBug/fireLevel now populated
            buildBuildingIndex(healthExplorerFiles, azureMetaGrid);
            syncRegistryMetaFromIndex();

            // Re-run fire + effects with AI-enriched data
            spawnFireBuildings(azureMetaGrid, healthExplorerFiles);
            spawnIssueIndicators(azureMetaGrid, healthExplorerFiles);
            reconcileBuildingIssueEffects(azureMetaGrid, healthExplorerFiles);
        })
        .catch((err) => {
            console.error("[IssueScan] Azure scan failed:", err.message);
        });

    for (const delayMs of [1500, 4000, 8000]) {
        setTimeout(
            () =>
                reconcileBuildingIssueEffects(
                    healthMetaGrid,
                    healthExplorerFiles,
                ),
            delayMs,
        );
    }
    repositoryExplorer.setFiles(healthExplorerFiles, currentRepoName);
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
    repositoryExplorer.selectBuildingId(null);
}

function generateCity(contribs, options = {}) {
    clearScene(scene);
    clearFireBuildings();
    clearIssueIndicators();
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
