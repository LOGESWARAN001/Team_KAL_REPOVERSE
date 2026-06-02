/**
 * Premium generation loader — stepped progress copy while the city builds.
 */

const STEPS = [
    "Analyzing Repository",
    "Mapping Architecture",
    "Generating Districts",
    "Constructing Buildings",
    "Creating City",
];

let loaderEl = null;
let stepEls = [];
let progressEl = null;
let activeIndex = 0;
let stepTimer = null;

function getElements() {
    loaderEl = document.getElementById("landingLoader");
    progressEl = document.getElementById("landingLoaderProgress");
    stepEls = STEPS.map((_, i) =>
        document.getElementById(`landingLoaderStep${i}`),
    ).filter(Boolean);
}

/**
 * Shows the full-screen loader overlay.
 */
export function showLandingLoader() {
    getElements();
    if (!loaderEl) return;
    activeIndex = 0;
    loaderEl.classList.remove("hidden");
    loaderEl.setAttribute("aria-hidden", "false");
    updateStepUI(0);
    if (progressEl) progressEl.style.width = "8%";
}

/**
 * Hides the loader overlay.
 */
export function hideLandingLoader() {
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = null;
    if (!loaderEl) return;
    loaderEl.classList.add("hidden");
    loaderEl.setAttribute("aria-hidden", "true");
}

/**
 * Advances the visible step (0–4). Call during fetch / city build pipeline.
 * @param {number} index
 */
export function setLoaderStep(index) {
    activeIndex = Math.min(Math.max(index, 0), STEPS.length - 1);
    updateStepUI(activeIndex);
    if (progressEl) {
        const pct = ((activeIndex + 1) / STEPS.length) * 100;
        progressEl.style.width = `${pct}%`;
    }
}

function updateStepUI(index) {
    stepEls.forEach((el, i) => {
        if (!el) return;
        el.classList.toggle("is-active", i === index);
        el.classList.toggle("is-done", i < index);
    });
}

/**
 * Runs async work while auto-advancing steps on an interval.
 * @param {() => Promise<void>} task
 */
export async function runWithLoaderSteps(task) {
    showLandingLoader();
    let i = 0;
    stepTimer = setInterval(() => {
        if (i < STEPS.length - 1) {
            i++;
            setLoaderStep(i);
        }
    }, 900);

    try {
        await task();
        setLoaderStep(STEPS.length - 1);
        await new Promise((r) => setTimeout(r, 500));
    } finally {
        if (stepTimer) clearInterval(stepTimer);
        hideLandingLoader();
    }
}

export { STEPS as LOADER_STEPS };
