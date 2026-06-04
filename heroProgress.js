/**
 * Hero progression — XP, city health, badges, repairs.
 */

const STORAGE_KEY = "github_city_hero_progress";

const defaultState = () => ({
    xp: 0,
    cityHealth: 72,
    heroBadges: 0,
    buildingsRepaired: 0,
    issuesResolved: 0,
    heroScore: 0,
    repairedBuildingIds: [],
    challengesCompleted: 0,
    challengeStats: {
        game: 0,
        math: 0,
        quiz: 0,
    },
});

let state = loadState();
const listeners = new Set();

function loadState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
    return defaultState();
}

function saveState() {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

export function getHeroProgress() {
    return { ...state, repairedBuildingIds: [...state.repairedBuildingIds] };
}

export function subscribeHeroProgress(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function notify() {
    saveState();
    const snapshot = getHeroProgress();
    for (const fn of listeners) fn(snapshot);
}

export function resetHeroProgress() {
    state = defaultState();
    notify();
}

export function isBuildingRepairedInProgress(buildingId) {
    return state.repairedBuildingIds.includes(buildingId);
}

export function awardMissionComplete(buildingId, severity = "medium") {
    if (buildingId && state.repairedBuildingIds.includes(buildingId)) {
        return null;
    }

    const xpGain =
        { minor: 60, medium: 100, high: 140, critical: 200 }[severity] || 100;
    const healthGain =
        { minor: 5, medium: 10, high: 15, critical: 20 }[severity] || 10;

    state.xp += xpGain;
    state.cityHealth = Math.min(100, state.cityHealth + healthGain);
    state.heroBadges += 1;
    state.buildingsRepaired += 1;
    state.issuesResolved += 1;
    state.heroScore += xpGain + healthGain * 2;
    if (buildingId) state.repairedBuildingIds.push(buildingId);

    notify();
    return { xpGain, healthGain, badgeGain: 1 };
}

/** Rewards after completing a Hero Challenge (game, math, or quiz). */
export function awardHeroChallengeComplete(buildingId, challengeKind = null) {
    if (buildingId && state.repairedBuildingIds.includes(buildingId)) {
        return null;
    }

    const xpGain = 100;
    const healthGain = 1;
    const buildingGain = 1;

    state.xp += xpGain;
    state.cityHealth = Math.min(100, state.cityHealth + healthGain);
    state.buildingsRepaired += buildingGain;
    state.issuesResolved += 1;
    state.challengesCompleted += 1;
    state.heroScore += xpGain + healthGain * 2;
    if (buildingId) state.repairedBuildingIds.push(buildingId);

    if (challengeKind && state.challengeStats[challengeKind] != null) {
        state.challengeStats[challengeKind] += 1;
    }

    notify();
    return { xpGain, healthGain, buildingGain, challengeKind };
}
