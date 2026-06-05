/**
 * Hero challenge type registry — extensible for future challenge kinds.
 */

import { createMathChallenge } from "./mathChallenge.js";
import { createQuizChallenge } from "./quizChallenge.js";
import { createSnakeChallenge } from "./snakeChallenge.js";

/** @typedef {'game'|'math'|'quiz'} HeroChallengeKind */

/**
 * @typedef {Object} HeroChallengeType
 * @property {HeroChallengeKind} id
 * @property {string} icon
 * @property {string} title
 * @property {string} description
 * @property {(container: HTMLElement, callbacks: ChallengeCallbacks) => () => void} create
 */

/**
 * @typedef {Object} ChallengeCallbacks
 * @property {() => void} onSuccess
 * @property {() => void} onFail
 */

export const HERO_CHALLENGE_TYPES = [
    {
        id: "game",
        icon: "🎮",
        title: "Play a Game",
        description: "Snake Challenge — fix 5 bugs to win",
        create: createSnakeChallenge,
    },
    {
        id: "math",
        icon: "🧮",
        title: "Solve a Math Challenge",
        description: "Quick addition or subtraction",
        create: createMathChallenge,
    },
    {
        id: "quiz",
        icon: "❓",
        title: "Take a Quick Quiz",
        description: "One easy multiple-choice question",
        create: createQuizChallenge,
    },
];

/** Reserved for future expansion (memory, puzzle, typing, logic). */
export const FUTURE_CHALLENGE_KINDS = [
    "memory",
    "puzzle",
    "typing",
    "logic",
];

export function getChallengeTypeById(id) {
    return HERO_CHALLENGE_TYPES.find((t) => t.id === id) ?? null;
}
