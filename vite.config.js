/**
 * Vite configuration for RepoVerse.
 *
 * Static GLB models live in public/assets/ and are copied verbatim to
 * dist/assets/ on build (alongside hashed JS/CSS bundles).
 */

import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    return {
        base: "./",
        publicDir: "public",
        envPrefix: "VITE_",
        plugins: [
            {
                name: "github-api-proxy",
                configureServer(server) {
                    server.middlewares.use(async (req, res, next) => {
                        if (!req.url?.startsWith("/github-api/")) {
                            return next();
                        }

                        const apiPath = req.url.replace(/^\/github-api/, "");
                        const clientToken = req.headers["x-github-token"];
                        const token =
                            (typeof clientToken === "string" &&
                                clientToken.trim()) ||
                            env.VITE_GITHUB_TOKEN ||
                            "";

                        const readBody = () =>
                            new Promise((resolve, reject) => {
                                const chunks = [];
                                req.on("data", (chunk) => chunks.push(chunk));
                                req.on("end", () =>
                                    resolve(
                                        chunks.length
                                            ? Buffer.concat(chunks).toString()
                                            : undefined,
                                    ),
                                );
                                req.on("error", reject);
                            });

                        try {
                            const headers = {
                                Accept: "application/vnd.github+json",
                                "X-GitHub-Api-Version": "2022-11-28",
                                "User-Agent": "GitHubCity/1.0",
                            };
                            if (token) {
                                headers.Authorization = `Bearer ${token}`;
                            }
                            if (req.headers["content-type"]) {
                                headers["Content-Type"] =
                                    req.headers["content-type"];
                            }

                            const requestBody = await readBody();
                            const response = await fetch(
                                `https://api.github.com${apiPath}`,
                                {
                                    method: req.method || "GET",
                                    headers,
                                    body:
                                        requestBody &&
                                        req.method &&
                                        req.method !== "GET"
                                            ? requestBody
                                            : undefined,
                                },
                            );
                            const responseBody = await response.text();
                            res.statusCode = response.status;
                            res.setHeader(
                                "Content-Type",
                                "application/json; charset=utf-8",
                            );
                            res.end(responseBody);
                        } catch {
                            res.statusCode = 502;
                            res.setHeader(
                                "Content-Type",
                                "application/json; charset=utf-8",
                            );
                            res.end(
                                JSON.stringify({
                                    message: "GitHub proxy request failed",
                                }),
                            );
                        }
                    });
                },
            },
        ],
    };
});
