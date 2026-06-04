/**
 * Lightweight Fruit Slice mini-game (10–20s, tap/click to score).
 */

const GAME_DURATION_MS = 15000;
const MIN_SCORE = 50;
const POINTS_PER_SLICE = 10;
const SPAWN_INTERVAL_MS = 550;

const FRUIT_EMOJI = ["🍉", "🍎", "🍊", "🍋", "🍇", "🍓"];

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess: () => void, onFail: () => void }} callbacks
 * @returns {() => void} cleanup
 */
export function createFruitSliceChallenge(container, { onSuccess, onFail }) {
    let score = 0;
    let timeLeft = GAME_DURATION_MS;
    let running = true;
    let spawnTimer = null;
    let rafId = null;
    let lastTs = null;

    container.innerHTML = `
        <div class="hero-challenge-active hero-challenge-game">
            <div class="hero-challenge-game-hud">
                <span>🍉 Fruit Slice</span>
                <span id="heroGameScore">Score: 0</span>
                <span id="heroGameTimer">15s</span>
            </div>
            <p class="hero-challenge-game-hint">Tap or click fruits before time runs out. Need ${MIN_SCORE} points!</p>
            <div class="hero-challenge-game-area" id="heroGameArea" role="application" aria-label="Fruit slice game area"></div>
            <p class="hero-challenge-feedback hidden" id="heroGameFeedback"></p>
            <button type="button" class="hero-challenge-retry-btn hidden" id="heroGameRetry">Try Again</button>
        </div>
    `;

    const area = container.querySelector("#heroGameArea");
    const scoreEl = container.querySelector("#heroGameScore");
    const timerEl = container.querySelector("#heroGameTimer");
    const feedback = container.querySelector("#heroGameFeedback");
    const retryBtn = container.querySelector("#heroGameRetry");

    function updateHud() {
        if (scoreEl) scoreEl.textContent = `Score: ${score}`;
        if (timerEl) {
            timerEl.textContent = `${Math.ceil(timeLeft / 1000)}s`;
        }
    }

    function spawnFruit() {
        if (!running || !area) return;
        const fruit = document.createElement("button");
        fruit.type = "button";
        fruit.className = "hero-challenge-fruit";
        fruit.setAttribute("aria-label", "Slice fruit");
        fruit.textContent =
            FRUIT_EMOJI[Math.floor(Math.random() * FRUIT_EMOJI.length)];
        const pad = 12;
        const w = area.clientWidth || 280;
        const h = area.clientHeight || 200;
        fruit.style.left = `${pad + Math.random() * Math.max(40, w - 56)}px`;
        fruit.style.top = `${pad + Math.random() * Math.max(40, h - 56)}px`;

        const removeFruit = () => {
            fruit.remove();
        };

        const autoRemove = setTimeout(removeFruit, 1100);

        fruit.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!running) return;
            clearTimeout(autoRemove);
            score += POINTS_PER_SLICE;
            updateHud();
            fruit.classList.add("hero-challenge-fruit--sliced");
            setTimeout(removeFruit, 120);
        });

        area.appendChild(fruit);
    }

    function endGame() {
        running = false;
        if (spawnTimer) clearInterval(spawnTimer);
        if (rafId) cancelAnimationFrame(rafId);
        area?.querySelectorAll(".hero-challenge-fruit").forEach((f) => f.remove());

        feedback.classList.remove("hidden");
        if (score >= MIN_SCORE) {
            feedback.classList.add("hero-challenge-feedback--success");
            feedback.textContent = `Challenge Success! You scored ${score} points.`;
            setTimeout(onSuccess, 700);
        } else {
            feedback.classList.add("hero-challenge-feedback--fail");
            feedback.textContent = `Challenge Failed (${score}/${MIN_SCORE}). Slice more fruits!`;
            retryBtn.classList.remove("hidden");
            onFail();
        }
    }

    function tick(ts) {
        if (!running) return;
        if (lastTs == null) lastTs = ts;
        const delta = ts - lastTs;
        lastTs = ts;
        timeLeft -= delta;
        updateHud();
        if (timeLeft <= 0) {
            timeLeft = 0;
            updateHud();
            endGame();
            return;
        }
        rafId = requestAnimationFrame(tick);
    }

    spawnTimer = setInterval(spawnFruit, SPAWN_INTERVAL_MS);
    spawnFruit();
    updateHud();
    rafId = requestAnimationFrame(tick);

    retryBtn?.addEventListener("click", () => {
        const cleanup = createFruitSliceChallenge(container, {
            onSuccess,
            onFail,
        });
        container._gameCleanup = cleanup;
    });

    return () => {
        running = false;
        if (spawnTimer) clearInterval(spawnTimer);
        if (rafId) cancelAnimationFrame(rafId);
        container.innerHTML = "";
    };
}
