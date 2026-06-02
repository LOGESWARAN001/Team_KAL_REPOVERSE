/**
 * Landing page orchestration — atmosphere, layout mode, and exit transitions.
 */

import {
    destroyLandingBackground,
    initLandingBackground,
} from "./landingBackground.js";
import { initTheme } from "./theme.js";

/**
 * Enables landing layout: hides 3D city canvas, shows atmospheric layer.
 */
export function enterLandingMode() {
    document.body.classList.add("landing-mode");
    const atmosphere = document.getElementById("landingAtmosphere");
    if (atmosphere) atmosphere.classList.remove("hidden");
    initLandingBackground();
}

/**
 * Leaves landing layout before the 3D city is shown.
 */
export function exitLandingMode() {
    destroyLandingBackground();
    const atmosphere = document.getElementById("landingAtmosphere");
    if (atmosphere) atmosphere.classList.add("hidden");
    document.body.classList.remove("landing-mode");
}

/**
 * Bootstraps theme + background for first paint.
 */
export function initLandingExperience() {
    initTheme();
    enterLandingMode();
}
