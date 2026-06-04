/**
 * Single-question multiple-choice hero challenge.
 */

const QUIZ_POOL = [
    {
        question: "Which tag creates a hyperlink?",
        options: ["<div>", "<a>", "<span>"],
        correctIndex: 1,
    },
    {
        question: "Which language is used for styling web pages?",
        options: ["HTML", "CSS", "SQL"],
        correctIndex: 1,
    },
    {
        question: "What does HTML stand for?",
        options: [
            "HyperText Markup Language",
            "High Tech Modern Language",
            "Home Tool Markup Language",
        ],
        correctIndex: 0,
    },
    {
        question: "Which keyword declares a variable in JavaScript?",
        options: ["var", "print", "echo"],
        correctIndex: 0,
    },
    {
        question: "Where do you typically store project dependencies in Node.js?",
        options: ["package.json", "index.html", "style.css"],
        correctIndex: 0,
    },
];

function pickQuestion() {
    return QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)];
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} container
 * @param {{ onSuccess: () => void, onFail: () => void }} callbacks
 * @returns {() => void} cleanup
 */
export function createQuizChallenge(container, { onSuccess, onFail }) {
    const quiz = pickQuestion();
    const labels = ["A", "B", "C", "D"];

    const optionsHtml = quiz.options
        .map(
            (opt, i) =>
                `<button type="button" class="hero-challenge-quiz-option" data-quiz-index="${i}">
                    <span class="hero-challenge-quiz-label">${labels[i]}.</span>
                    ${escapeHtml(opt)}
                </button>`,
        )
        .join("");

    container.innerHTML = `
        <div class="hero-challenge-active hero-challenge-quiz">
            <p class="hero-challenge-prompt">${escapeHtml(quiz.question)}</p>
            <div class="hero-challenge-quiz-options" id="heroQuizOptions">${optionsHtml}</div>
            <p class="hero-challenge-feedback hidden" id="heroQuizFeedback"></p>
            <button type="button" class="hero-challenge-retry-btn hidden" id="heroQuizRetry">Try Again</button>
        </div>
    `;

    const optionsEl = container.querySelector("#heroQuizOptions");
    const feedback = container.querySelector("#heroQuizFeedback");
    const retryBtn = container.querySelector("#heroQuizRetry");
    let answered = false;

    optionsEl?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-quiz-index]");
        if (!btn || answered) return;
        answered = true;
        const index = Number(btn.dataset.quizIndex);
        const correct = index === quiz.correctIndex;

        optionsEl.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
        });

        feedback.classList.remove("hidden");
        if (correct) {
            feedback.classList.add("hero-challenge-feedback--success");
            feedback.textContent = "Correct! Challenge complete.";
            setTimeout(onSuccess, 600);
        } else {
            feedback.classList.add("hero-challenge-feedback--fail");
            feedback.textContent = "Not quite — try again!";
            retryBtn.classList.remove("hidden");
            onFail();
        }
    });

    retryBtn?.addEventListener("click", () => {
        const cleanup = createQuizChallenge(container, { onSuccess, onFail });
        container._quizCleanup = cleanup;
    });

    return () => {
        container.innerHTML = "";
    };
}
