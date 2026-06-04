/**
 * Content-based syntax validation for repository files (HTML, JS, CSS, JSON).
 */

import * as acorn from "acorn";
import jsx from "acorn-jsx";

const JsParser = acorn.Parser.extend(jsx());

const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

const SKIPPED_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "ico",
    "svg",
    "woff",
    "woff2",
    "ttf",
    "eot",
    "mp4",
    "mp3",
    "zip",
    "gz",
    "pdf",
    "glb",
    "gltf",
    "bin",
    "exe",
    "dll",
    "lock",
]);

export function getFileTypeFromPath(filePath) {
    const name = (filePath || "").split("/").pop() || "";
    const dot = name.lastIndexOf(".");
    if (dot === -1) return "unknown";
    const ext = name.slice(dot + 1).toLowerCase();
    if (ext === "htm") return "html";
    if (["js", "mjs", "cjs", "jsx"].includes(ext)) return "javascript";
    if (["ts", "tsx"].includes(ext)) return "typescript";
    if (ext === "css") return "css";
    if (["scss", "sass", "less"].includes(ext)) return "stylesheet";
    if (ext === "json") return "json";
    if (ext === "vue" || ext === "svelte") return ext;
    if (ext === "html") return "html";
    return ext;
}

export function isAnalyzableFilePath(filePath) {
    const type = getFileTypeFromPath(filePath);
    if (type === "unknown") return false;
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext && SKIPPED_EXTENSIONS.has(ext)) return false;
    return ["html", "javascript", "typescript", "css", "stylesheet", "json", "vue", "svelte"].includes(
        type,
    );
}

function pushIssue(issues, { line, column, message, rule }) {
    const loc =
        line != null
            ? ` (line ${line}${column != null ? `, col ${column}` : ""})`
            : "";
    issues.push({
        type: "syntax",
        severity: "critical",
        title: `${message}${loc}`,
        rule: rule || "syntax",
        line,
        column,
    });
}

function parseJson(content, filePath) {
    const issues = [];
    try {
        JSON.parse(content);
    } catch (err) {
        const match = /position\s+(\d+)/i.exec(err.message || "");
        let line = 1;
        let column = 1;
        if (match) {
            const pos = Number(match[1]);
            const before = content.slice(0, pos);
            const lines = before.split("\n");
            line = lines.length;
            column = (lines[lines.length - 1]?.length || 0) + 1;
        }
        pushIssue(issues, {
            line,
            column,
            message: err.message || "Invalid JSON",
            rule: "json-parse",
        });
    }
    return issues;
}

function parseJavaScript(content, filePath, { jsx: useJsx = false } = {}) {
    const issues = [];
    const isModule =
        /^\s*(import|export)\s/m.test(content) ||
        /\.mjs$/i.test(filePath) ||
        /"type"\s*:\s*"module"/i.test(content.slice(0, 500));

    try {
        const parser = useJsx ? JsParser : acorn.Parser;
        parser.parse(content, {
            ecmaVersion: "latest",
            sourceType: isModule ? "module" : "script",
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: !isModule,
        });
    } catch (err) {
        pushIssue(issues, {
            line: err.loc?.line,
            column: err.loc?.column,
            message: err.message || "JavaScript syntax error",
            rule: "js-parse",
        });
    }
    return issues;
}

function parseTypeScriptLoose(content, filePath) {
    const issues = parseJavaScript(content, filePath, {
        jsx: /\.tsx$/i.test(filePath),
    });
    if (issues.length > 0) return issues;

    const stripped = content
        .replace(/^\s*import\s+type\s+.+$/gm, "")
        .replace(/:\s*[^=;,\n{]+(?=[=;,)\n])/g, "")
        .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, "")
        .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, "");

    return parseJavaScript(stripped, filePath, {
        jsx: /\.tsx$/i.test(filePath),
    });
}

function parseCssBraces(content) {
    const issues = [];
    let depth = 0;
    let inString = false;
    let quote = "";
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inString) {
            if (ch === quote && content[i - 1] !== "\\") inString = false;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth < 0) {
                pushIssue(issues, {
                    message: "Unexpected closing brace in CSS",
                    rule: "css-brace",
                });
                return issues;
            }
        }
    }
    if (depth > 0) {
        pushIssue(issues, {
            message: "Unclosed CSS block — missing closing brace",
            rule: "css-brace",
        });
    }
    return issues;
}

function parseCss(content) {
    const issues = parseCssBraces(content);
    if (typeof CSSStyleSheet !== "undefined") {
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(content);
        } catch (err) {
            pushIssue(issues, {
                message: err.message || "CSS syntax error",
                rule: "css-parse",
            });
        }
    }
    const seen = new Set();
    return issues.filter((issue) => {
        const key = issue.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseStylesheetPreprocessor(content) {
    const issues = [];
    let depth = 0;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth < 0) {
                pushIssue(issues, {
                    message: "Unmatched closing brace",
                    rule: "scss-brace",
                });
                return issues;
            }
        }
    }
    if (depth !== 0) {
        pushIssue(issues, {
            message: "Unclosed block — missing closing brace",
            rule: "scss-brace",
        });
    }
    return issues;
}

function extractTagName(raw) {
    const match = /^<\/?\s*([a-zA-Z][\w:-]*)/.exec(raw);
    return match ? match[1].toLowerCase() : null;
}

function isSelfClosing(raw) {
    return /\/\s*>$/.test(raw) || /^<!/.test(raw);
}

function validateHtmlStructure(content) {
    const issues = [];
    const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[a-zA-Z][^>]*>/g;
    const stack = [];
    let match;

    while ((match = tagPattern.exec(content)) !== null) {
        const raw = match[0];
        if (raw.startsWith("<!--") || raw.startsWith("<![CDATA")) continue;
        if (/^<!/.test(raw)) continue;

        const name = extractTagName(raw);
        if (!name) continue;

        const closing = /^<\//.test(raw);
        const selfClose = isSelfClosing(raw) || VOID_ELEMENTS.has(name);

        if (closing) {
            const top = stack[stack.length - 1];
            if (!top) {
                pushIssue(issues, {
                    message: `Unexpected closing tag </${name}>`,
                    rule: "html-close",
                });
                continue;
            }
            if (top !== name) {
                pushIssue(issues, {
                    message: `Mismatched tag: expected </${top}>, found </${name}>`,
                    rule: "html-mismatch",
                });
            } else {
                stack.pop();
            }
        } else if (!selfClose) {
            stack.push(name);
        }
    }

    for (const open of stack.reverse()) {
        pushIssue(issues, {
            message: `Unclosed <${open}> element — missing closing tag`,
            rule: "html-unclosed",
        });
    }

    const brokenAttr = /<[a-zA-Z][^>]*"[^>]*$/m.test(content);
    if (brokenAttr) {
        pushIssue(issues, {
            message: "Malformed HTML attribute or unclosed quote in tag",
            rule: "html-attr",
        });
    }

    return issues;
}

function validateInlineScriptsAndStyles(content) {
    const issues = [];
    const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    const stylePattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

    let m;
    while ((m = scriptPattern.exec(content)) !== null) {
        const body = m[1].trim();
        if (!body || /^src\s*=/i.test(m[0])) continue;
        issues.push(...parseJavaScript(body, "inline-script", { jsx: false }));
    }

    while ((m = stylePattern.exec(content)) !== null) {
        const body = m[1].trim();
        if (!body) continue;
        issues.push(...parseCss(body));
    }

    return issues;
}

function parseHtml(content) {
    const issues = [];

    if (typeof DOMParser !== "undefined") {
        const doc = new DOMParser().parseFromString(content, "text/html");
        const errNode = doc.querySelector("parsererror");
        if (errNode) {
            const text = errNode.textContent?.trim() || "HTML parse error";
            pushIssue(issues, {
                message: text.split("\n")[0],
                rule: "html-dom",
            });
        }
    }

    issues.push(...validateHtmlStructure(content));
    issues.push(...validateInlineScriptsAndStyles(content));

    const seen = new Set();
    return issues.filter((issue) => {
        const key = issue.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseVueSvelte(content, fileType) {
    const issues = [];
    const scriptMatch = content.match(
        /<script\b[^>]*>([\s\S]*?)<\/script>/i,
    );
    if (scriptMatch?.[1]?.trim()) {
        issues.push(
            ...parseJavaScript(scriptMatch[1], `inline-${fileType}-script`, {
                jsx: fileType === "svelte",
            }),
        );
    }
    const styleMatch = content.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch?.[1]?.trim()) {
        issues.push(...parseCss(styleMatch[1]));
    }
    const template = content
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    issues.push(...parseHtml(template));
    return issues;
}

/**
 * Analyze raw file text and return syntax/parse issues.
 * @param {string} filePath
 * @param {string} content
 * @returns {{ fileType: string, issues: Array<{ type: string, severity: string, title: string, rule?: string }> }}
 */
export function analyzeFileContent(filePath, content) {
    const fileType = getFileTypeFromPath(filePath);
    if (!content || typeof content !== "string") {
        return { fileType, issues: [] };
    }

    let issues = [];
    switch (fileType) {
        case "json":
            issues = parseJson(content, filePath);
            break;
        case "javascript":
            issues = parseJavaScript(content, filePath, {
                jsx: /\.jsx$/i.test(filePath),
            });
            break;
        case "typescript":
            issues = parseTypeScriptLoose(content, filePath);
            break;
        case "css":
            issues = parseCss(content);
            break;
        case "stylesheet":
            issues = [
                ...parseStylesheetPreprocessor(content),
                ...parseCss(content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
            ];
            break;
        case "html":
            issues = parseHtml(content);
            break;
        case "vue":
        case "svelte":
            issues = parseVueSvelte(content, fileType);
            break;
        default:
            break;
    }

    if (issues.length >= 3) {
        for (const issue of issues) {
            issue.severity = "critical";
        }
    }

    return { fileType, issues };
}
