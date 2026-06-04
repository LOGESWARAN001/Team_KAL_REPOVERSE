/**
 * Simple addition / subtraction hero challenge.
 */

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMathProblem() {
    const useAdd = Math.random() < 0.5;
    if (useAdd) {
        const a = randomInt(5, 25);
        const b = randomInt(5, 20);
        return { expression: `${a} + ${b}`, answer: a + b };
    }
    const a = randomInt(20, 40);
    const b = randomInt(5, 15);
    return { expression: `${a} - ${b}`, answer: a - b };
}

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess: () => void, onFail: () => void }} callbacks
 * @returns {() => void} cleanup
 */
export function createMathChallenge(container, { onSuccess, onFail }) {
    const problem = generateMathProblem();

    container.innerHTML = `
        <div class="hero-challenge-active hero-challenge-math">
            <p class="hero-challenge-prompt">Solve to repair the building:</p>
            <p class="hero-challenge-math-expression">${problem.expression} = ?</p>
            <form class="hero-challenge-math-form" id="heroMathForm">
                <input
                    type="number"
                    class="hero-challenge-math-input"
                    id="heroMathInput"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-label="Your answer"
                    required
                />
                <button type="submit" class="hero-challenge-submit-btn">Submit Answer</button>
            </form>
            <p class="hero-challenge-feedback hidden" id="heroMathFeedback"></p>
            <button type="button" class="hero-challenge-retry-btn hidden" id="heroMathRetry">Try Again</button>
        </div>
    `;

    const form = container.querySelector("#heroMathForm");
    const input = container.querySelector("#heroMathInput");
    const feedback = container.querySelector("#heroMathFeedback");
    const retryBtn = container.querySelector("#heroMathRetry");

    function showFail() {
        feedback.classList.remove("hidden");
        feedback.classList.add("hero-challenge-feedback--fail");
        feedback.textContent = "Not quite — try again!";
        retryBtn.classList.remove("hidden");
        onFail();
    }

    form?.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = Number(input?.value);
        if (Number.isNaN(value)) {
            showFail();
            return;
        }
        if (value === problem.answer) {
            feedback.classList.remove("hidden", "hero-challenge-feedback--fail");
            feedback.classList.add("hero-challenge-feedback--success");
            feedback.textContent = "Correct! Challenge complete.";
            form.querySelector("button")?.setAttribute("disabled", "true");
            input.disabled = true;
            setTimeout(onSuccess, 600);
        } else {
            showFail();
        }
    });

    retryBtn?.addEventListener("click", () => {
        const cleanup = createMathChallenge(container, { onSuccess, onFail });
        container._mathCleanup = cleanup;
    });

    input?.focus();

    return () => {
        container.innerHTML = "";
    };
}
