/**
 * Polished Snake mini-game for Hero Challenge — fix bugs, save the building.
 */

/** @typedef {'easy'|'medium'|'hard'} SnakeDifficultyId */

/** @type {Record<SnakeDifficultyId, { gridSize: number, tickMs: number, minTickMs: number, targetScore: number }>} */
export const SNAKE_DIFFICULTY = {
    easy: { gridSize: 16, tickMs: 220, minTickMs: 130, targetScore: 5 },
    medium: { gridSize: 20, tickMs: 170, minTickMs: 95, targetScore: 8 },
    hard: { gridSize: 20, tickMs: 120, minTickMs: 70, targetScore: 12 },
};

const DEFAULT_DIFFICULTY = "easy";

const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

/** Sound-ready hook — wire up audio later without changing game logic. */
export const snakeSoundBus = {
    enabled: false,
    play(_event) {
        if (this.enabled) {
            // Future: playSound(event)
        }
    },
};

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess: () => void, onFail: () => void }} callbacks
 * @returns {() => void} cleanup
 */
export function createSnakeChallenge(container, { onSuccess, onFail }) {
    const config = SNAKE_DIFFICULTY[DEFAULT_DIFFICULTY];
    const { gridSize, tickMs, minTickMs, targetScore } = config;

    let score = 0;
    let running = true;
    let tickTimer = null;
    let rafId = null;
    let cellSize = 14;
    let boardSize = 260;
    let dpr = 1;
    let currentTickMs = tickMs;
    let lastTickAt = performance.now();
    let animProgress = 1;
    let elapsedSec = 0;
    let timeInterval = null;

    /** @type {{ x: number, y: number }[]} */
    let snake = [];
    /** @type {{ x: number, y: number }[]} */
    let prevSnake = [];
    let direction = DIRS.right;
    let nextDirection = DIRS.right;
    /** @type {{ x: number, y: number, spawnAt: number } | null} */
    let food = null;
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, hue: number }[]} */
    let particles = [];
    /** @type {{ x: number, y: number, life: number }[]} */
    let popups = [];

    const panel = container.closest(".hero-challenge-panel");
    panel?.classList.add("hero-challenge-panel--snake");

    container.innerHTML = `
        <div class="hero-challenge-active hero-challenge-snake">
            <div class="snake-hud">
                <div class="snake-hud__row">
                    <span class="snake-hud__title">🐍 Snake Challenge</span>
                    <span class="snake-hud__hint snake-hud__hint--desktop">Arrow keys / WASD</span>
                </div>
                <div class="snake-hud__stats">
                    <span class="snake-hud__stat" id="heroSnakeScore">Score: <strong>0</strong></span>
                    <span class="snake-hud__stat">Target: <strong>${targetScore}</strong></span>
                    <span class="snake-hud__stat" id="heroSnakeTime">Time: <strong>0s</strong></span>
                </div>
                <div class="snake-hud__progress" aria-label="Progress toward target">
                    <div class="snake-hud__progress-fill" id="heroSnakeProgress"></div>
                </div>
            </div>
            <div class="snake-board-wrap" id="heroSnakeArea">
                <canvas id="heroSnakeCanvas" class="snake-canvas" tabindex="0" aria-label="Snake game board"></canvas>
                <div class="snake-overlay hidden" id="heroSnakeOverlay" aria-live="polite"></div>
            </div>
            <div class="snake-controls" id="heroSnakeControls" aria-label="Directional controls">
                <button type="button" class="snake-controls__btn snake-controls__btn--up" data-dir="up" aria-label="Up">⬆</button>
                <button type="button" class="snake-controls__btn snake-controls__btn--left" data-dir="left" aria-label="Left">⬅</button>
                <button type="button" class="snake-controls__btn snake-controls__btn--down" data-dir="down" aria-label="Down">⬇</button>
                <button type="button" class="snake-controls__btn snake-controls__btn--right" data-dir="right" aria-label="Right">➡</button>
            </div>
            <p class="snake-tagline">Eat bugs to fix the repository!</p>
            <p class="hero-challenge-feedback hidden" id="heroSnakeFeedback"></p>
            <button type="button" class="hero-challenge-retry-btn hidden" id="heroSnakeRetry">Try Again</button>
        </div>
    `;

    const area = container.querySelector("#heroSnakeArea");
    const canvas = container.querySelector("#heroSnakeCanvas");
    const ctx = canvas?.getContext("2d");
    const scoreEl = container.querySelector("#heroSnakeScore strong");
    const timeEl = container.querySelector("#heroSnakeTime strong");
    const progressEl = container.querySelector("#heroSnakeProgress");
    const overlay = container.querySelector("#heroSnakeOverlay");
    const feedback = container.querySelector("#heroSnakeFeedback");
    const retryBtn = container.querySelector("#heroSnakeRetry");
    const controls = container.querySelector("#heroSnakeControls");

    function initSnake() {
        const mid = Math.floor(gridSize / 2);
        snake = [
            { x: mid - 2, y: mid },
            { x: mid - 1, y: mid },
            { x: mid, y: mid },
        ];
        prevSnake = snake.map((s) => ({ ...s }));
        direction = DIRS.right;
        nextDirection = DIRS.right;
        score = 0;
        currentTickMs = tickMs;
        elapsedSec = 0;
        particles = [];
        popups = [];
        animProgress = 1;
        updateHud();
        spawnFood();
    }

    function updateHud() {
        if (scoreEl) scoreEl.textContent = String(score);
        if (timeEl) timeEl.textContent = `${elapsedSec}s`;
        if (progressEl) {
            const pct = Math.min(100, (score / targetScore) * 100);
            progressEl.style.width = `${pct}%`;
        }
    }

    function resizeCanvas() {
        if (!area || !canvas || !ctx) return;
        const rect = area.getBoundingClientRect();
        const inner = Math.floor(Math.min(rect.width, rect.height)) - 6;
        if (inner < 80) {
            requestAnimationFrame(resizeCanvas);
            return;
        }
        boardSize = inner;
        dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(boardSize * dpr);
        canvas.height = Math.floor(boardSize * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cellSize = boardSize / gridSize;
        draw(animProgress);
    }

    function spawnFood() {
        const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
        let attempts = 0;
        do {
            food = {
                x: Math.floor(Math.random() * gridSize),
                y: Math.floor(Math.random() * gridSize),
                spawnAt: performance.now(),
            };
            attempts++;
        } while (occupied.has(`${food.x},${food.y}`) && attempts < 300);
    }

    function setDirection(dir) {
        if (!running) return;
        if (dir.x === -direction.x && dir.y === -direction.y) return;
        nextDirection = dir;
    }

    function cellCenter(x, y) {
        return {
            cx: x * cellSize + cellSize / 2,
            cy: y * cellSize + cellSize / 2,
        };
    }

    function burstParticles(cx, cy) {
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
            const speed = 1.5 + Math.random() * 2.5;
            particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                hue: 140 + Math.random() * 40,
            });
        }
    }

    function addScorePopup(cx, cy) {
        popups.push({ x: cx, y: cy, life: 1 });
    }

    function drawBoard() {
        if (!ctx || !canvas) return;
        const w = boardSize;
        const h = boardSize;

        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, "rgba(8, 18, 32, 0.98)");
        bgGrad.addColorStop(1, "rgba(4, 10, 20, 0.98)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "rgba(48, 225, 183, 0.06)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= gridSize; i++) {
            const p = (i * w) / gridSize;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(w, p);
            ctx.stroke();
        }

        ctx.strokeStyle = "rgba(48, 225, 183, 0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    function drawFood(now) {
        if (!food || !ctx) return;
        const { cx, cy } = cellCenter(food.x, food.y);
        const spawnAge = now - food.spawnAt;
        const spawnT = Math.min(1, spawnAge / 280);
        const pulse = 1 + Math.sin(now / 200) * 0.08;
        const scale = (0.3 + spawnT * 0.7) * pulse;
        const r = (cellSize * 0.32) * scale;

        ctx.save();
        ctx.shadowColor = "rgba(255, 180, 60, 0.7)";
        ctx.shadowBlur = cellSize * 0.5;
        ctx.font = `${Math.floor(cellSize * 0.62 * scale)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐞", cx, cy + 1);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 80, ${0.25 * spawnT})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawRoundedSegment(px, py, size, radius, fill, glow) {
        if (!ctx) return;
        const r = Math.min(radius, size / 2);
        ctx.save();
        if (glow) {
            ctx.shadowColor = glow;
            ctx.shadowBlur = size * 0.6;
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + size - r, py);
        ctx.quadraticCurveTo(px + size, py, px + size, py + r);
        ctx.lineTo(px + size, py + size - r);
        ctx.quadraticCurveTo(px + size, py + size, px + size - r, py + size);
        ctx.lineTo(px + r, py + size);
        ctx.quadraticCurveTo(px, py + size, px, py + size - r);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawSnake(progress) {
        if (!ctx || snake.length === 0) return;
        const pad = cellSize * 0.1;
        const segSize = cellSize - pad * 2;
        const len = snake.length;

        for (let i = 0; i < len; i++) {
            const curr = snake[i];
            const isHead = i === len - 1;
            const from = isHead
                ? prevSnake[i] || curr
                : prevSnake[i + 1] || prevSnake[i] || curr;
            const t = progress;
            const dx = from.x + (curr.x - from.x) * t;
            const dy = from.y + (curr.y - from.y) * t;
            const px = dx * cellSize + pad;
            const py = dy * cellSize + pad;
            const fade = 0.55 + (i / len) * 0.45;
            const fill = isHead
                ? "#30e1b7"
                : `rgba(48, 225, 183, ${fade * 0.85})`;
            drawRoundedSegment(
                px,
                py,
                segSize,
                cellSize * 0.28,
                fill,
                isHead ? "rgba(48, 225, 183, 0.9)" : null,
            );

            if (isHead) {
                const { cx, cy } = cellCenter(dx, dy);
                const eyeOff = cellSize * 0.14;
                const eyeR = cellSize * 0.07;
                ctx.fillStyle = "#0a1a14";
                ctx.beginPath();
                if (direction === DIRS.right) {
                    ctx.arc(cx + eyeOff, cy - eyeOff, eyeR, 0, Math.PI * 2);
                    ctx.arc(cx + eyeOff, cy + eyeOff, eyeR, 0, Math.PI * 2);
                } else if (direction === DIRS.left) {
                    ctx.arc(cx - eyeOff, cy - eyeOff, eyeR, 0, Math.PI * 2);
                    ctx.arc(cx - eyeOff, cy + eyeOff, eyeR, 0, Math.PI * 2);
                } else if (direction === DIRS.up) {
                    ctx.arc(cx - eyeOff, cy - eyeOff, eyeR, 0, Math.PI * 2);
                    ctx.arc(cx + eyeOff, cy - eyeOff, eyeR, 0, Math.PI * 2);
                } else {
                    ctx.arc(cx - eyeOff, cy + eyeOff, eyeR, 0, Math.PI * 2);
                    ctx.arc(cx + eyeOff, cy + eyeOff, eyeR, 0, Math.PI * 2);
                }
                ctx.fill();

                const tipLen = cellSize * 0.22;
                ctx.fillStyle = "rgba(48, 225, 183, 0.9)";
                ctx.beginPath();
                if (direction === DIRS.right) {
                    ctx.moveTo(cx + cellSize * 0.3, cy);
                    ctx.lineTo(cx + cellSize * 0.3 + tipLen, cy - tipLen * 0.5);
                    ctx.lineTo(cx + cellSize * 0.3 + tipLen, cy + tipLen * 0.5);
                } else if (direction === DIRS.left) {
                    ctx.moveTo(cx - cellSize * 0.3, cy);
                    ctx.lineTo(cx - cellSize * 0.3 - tipLen, cy - tipLen * 0.5);
                    ctx.lineTo(cx - cellSize * 0.3 - tipLen, cy + tipLen * 0.5);
                } else if (direction === DIRS.up) {
                    ctx.moveTo(cx, cy - cellSize * 0.3);
                    ctx.lineTo(cx - tipLen * 0.5, cy - cellSize * 0.3 - tipLen);
                    ctx.lineTo(cx + tipLen * 0.5, cy - cellSize * 0.3 - tipLen);
                } else {
                    ctx.moveTo(cx, cy + cellSize * 0.3);
                    ctx.lineTo(cx - tipLen * 0.5, cy + cellSize * 0.3 + tipLen);
                    ctx.lineTo(cx + tipLen * 0.5, cy + cellSize * 0.3 + tipLen);
                }
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    function drawParticles(dt) {
        if (!ctx) return;
        particles = particles.filter((p) => {
            p.life -= dt * 2.2;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            if (p.life <= 0) return false;
            ctx.globalAlpha = p.life;
            ctx.fillStyle = `hsl(${p.hue}, 80%, 60%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 + p.life * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return true;
        });
    }

    function drawPopups(dt) {
        if (!ctx) return;
        popups = popups.filter((p) => {
            p.life -= dt * 1.8;
            if (p.life <= 0) return false;
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.font = `bold ${Math.floor(cellSize * 0.45)}px sans-serif`;
            ctx.fillStyle = "#30e1b7";
            ctx.textAlign = "center";
            ctx.fillText("+1 🐞", p.x, p.y - (1 - p.life) * 28);
            ctx.restore();
            return true;
        });
    }

    function draw(progress) {
        if (!ctx || !canvas) return;
        const now = performance.now();
        drawBoard();
        drawFood(now);
        drawSnake(progress);
        drawParticles(0.016);
        drawPopups(0.016);
    }

    let lastFrame = performance.now();

    function frameLoop(now) {
        if (!running && particles.length === 0 && popups.length === 0) return;
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        animProgress = Math.min(1, (now - lastTickAt) / currentTickMs);

        if (ctx && canvas) {
            drawBoard();
            drawFood(now);
            drawSnake(animProgress);
            drawParticles(dt);
            drawPopups(dt);
        }

        rafId = requestAnimationFrame(frameLoop);
    }

    function showSuccessOverlay() {
        if (!overlay) return;
        overlay.classList.remove("hidden");
        overlay.innerHTML = `
            <div class="snake-success">
                <div class="snake-success__burst" aria-hidden="true"></div>
                <p class="snake-success__title">🎉 Challenge Complete</p>
                <p class="snake-success__line">🐞 Bugs Fixed: <strong>${score}</strong></p>
                <p class="snake-success__line">🏢 Building Repaired</p>
                <p class="snake-success__line">✨ City Health Restored</p>
            </div>
        `;
    }

    function handleSuccess() {
        running = false;
        if (tickTimer) clearInterval(tickTimer);
        if (timeInterval) clearInterval(timeInterval);
        snakeSoundBus.play("success");
        showSuccessOverlay();
        feedback?.classList.add("hidden");
        setTimeout(onSuccess, 1600);
    }

    function handleFail() {
        running = false;
        if (tickTimer) clearInterval(tickTimer);
        if (timeInterval) clearInterval(timeInterval);
        snakeSoundBus.play("fail");
        feedback?.classList.remove("hidden");
        feedback?.classList.add("hero-challenge-feedback--fail");
        if (feedback) {
            feedback.textContent = `Challenge Failed (${score}/${targetScore}). Fix more bugs!`;
        }
        retryBtn?.classList.remove("hidden");
        onFail();
    }

    function scheduleTick() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(tick, currentTickMs);
    }

    function tick() {
        if (!running) return;

        prevSnake = snake.map((s) => ({ ...s }));
        direction = nextDirection;
        const head = snake[snake.length - 1];
        const newHead = {
            x: head.x + direction.x,
            y: head.y + direction.y,
        };

        if (
            newHead.x < 0 ||
            newHead.x >= gridSize ||
            newHead.y < 0 ||
            newHead.y >= gridSize
        ) {
            handleFail();
            return;
        }

        if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
            handleFail();
            return;
        }

        snake.push(newHead);
        lastTickAt = performance.now();
        animProgress = 0;

        if (food && newHead.x === food.x && newHead.y === food.y) {
            score++;
            currentTickMs = Math.max(minTickMs, tickMs - score * 14);
            scheduleTick();
            updateHud();
            const { cx, cy } = cellCenter(food.x, food.y);
            burstParticles(cx, cy);
            addScorePopup(cx, cy);
            snakeSoundBus.play("eat");

            if (score >= targetScore) {
                draw(1);
                handleSuccess();
                return;
            }
            spawnFood();
        } else {
            snake.shift();
        }
    }

    function onKeyDown(e) {
        if (!running) return;
        const key = e.key.toLowerCase();
        if (key === "arrowup" || key === "w") setDirection(DIRS.up);
        else if (key === "arrowdown" || key === "s") setDirection(DIRS.down);
        else if (key === "arrowleft" || key === "a") setDirection(DIRS.left);
        else if (key === "arrowright" || key === "d") setDirection(DIRS.right);
        else return;
        e.preventDefault();
    }

    controls?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-dir]");
        if (!btn) return;
        const map = {
            up: DIRS.up,
            down: DIRS.down,
            left: DIRS.left,
            right: DIRS.right,
        };
        setDirection(map[btn.dataset.dir] || DIRS.right);
    });

    /** @type {ResizeObserver | null} */
    let resizeObserver = null;

    initSnake();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            resizeCanvas();
            if (area && typeof ResizeObserver !== "undefined") {
                resizeObserver = new ResizeObserver(() => resizeCanvas());
                resizeObserver.observe(area);
            }
        });
    });
    window.addEventListener("keydown", onKeyDown);
    canvas?.focus();

    lastTickAt = performance.now();
    rafId = requestAnimationFrame(frameLoop);
    scheduleTick();

    timeInterval = setInterval(() => {
        if (!running) return;
        elapsedSec++;
        updateHud();
    }, 1000);

    retryBtn?.addEventListener("click", () => {
        const cleanup = createSnakeChallenge(container, { onSuccess, onFail });
        container._snakeCleanup = cleanup;
    });

    return () => {
        running = false;
        if (tickTimer) clearInterval(tickTimer);
        if (timeInterval) clearInterval(timeInterval);
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        window.removeEventListener("keydown", onKeyDown);
        panel?.classList.remove("hero-challenge-panel--snake");
        container.innerHTML = "";
    };
}
