/**
 * Atmospheric landing background — subtle particles and gradient motion.
 *
 * Renders on a 2D canvas (not the Three.js city canvas) so the hero stays calm.
 * Listens for theme changes to adjust particle colors.
 */

import { getTheme } from "./theme.js";

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;
let animationId = null;
let particles = [];
let width = 0;
let height = 0;

const PARTICLE_COUNT = 48;

function themeColors() {
    return getTheme() === "dark"
        ? { r: 200, g: 210, b: 230 }
        : { r: 80, g: 100, b: 120 };
}

function createParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: 0.6 + Math.random() * 1.8,
            vx: (Math.random() - 0.5) * 0.15,
            vy: -0.05 - Math.random() * 0.2,
            phase: Math.random() * Math.PI * 2,
        });
    }
}

function resize() {
    if (!canvas) return;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
}

function draw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.008;

        if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        const alpha = 0.25 + 0.35 * Math.sin(p.phase);
        const { r, g, b } = themeColors();
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }

    animationId = requestAnimationFrame(draw);
}

/**
 * Starts particle field inside #landingParticles canvas.
 */
export function initLandingBackground() {
    canvas = document.getElementById("landingParticles");
    if (!canvas) return;

    ctx = canvas.getContext("2d");
    resize();
    createParticles();
    window.addEventListener("resize", () => {
        resize();
        createParticles();
    });
    window.addEventListener("ghc-theme-change", () => {});

    if (animationId) cancelAnimationFrame(animationId);
    draw();
}

export function destroyLandingBackground() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    particles = [];
}
