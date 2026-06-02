/**
 * Theme system — persists user preference and syncs with system settings.
 *
 * Accessibility: respects `prefers-color-scheme` when no saved preference exists.
 * Applies `data-theme="light" | "dark"` on <html> for CSS variable overrides.
 */

const STORAGE_KEY = "ghc-theme";

/** @returns {"light" | "dark"} */
export function getTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

/** @param {"light" | "dark"} theme */
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);

    const toggle = document.getElementById("themeToggle");
    if (toggle) {
        toggle.setAttribute(
            "aria-pressed",
            theme === "dark" ? "true" : "false",
        );
        toggle.setAttribute(
            "aria-label",
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        );
    }
}

export function toggleTheme() {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
}

/**
 * Initializes theme on load and wires the header toggle control.
 */
export function initTheme() {
    applyTheme(getTheme());

    const toggle = document.getElementById("themeToggle");
    if (toggle) {
        toggle.addEventListener("click", () => {
            toggleTheme();
            window.dispatchEvent(new CustomEvent("ghc-theme-change"));
        });
    }

    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                applyTheme(e.matches ? "dark" : "light");
                window.dispatchEvent(new CustomEvent("ghc-theme-change"));
            }
        });
}
