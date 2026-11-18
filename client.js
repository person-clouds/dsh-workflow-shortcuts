window.__ModuleLoader__.load({
id: "dsh-workflow-shortcuts",
factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

/**
 * /D、/G 两个大写单字母快捷命令的 Client 实现。
 *
 * Host 命令名只允许小写，所以这里注册一个独立的 `/` 输入源：
 * 菜单、空格、回车和命令 chip 恢复都返回自定义 claim，
 * submit 时直接调用 Client 的 Session 服务完成动作。
 */

const inject = ["inputTriggers", "sessions", "workspaces", "uiWorkspace", "remote", "remote.workspaceFiles"];

// 与内置 /plan、/goal 等命令使用同一套图标组件。
const { IconPlanOutlineRegular, IconPlayOutlineRegular } = require("@deepseek-ai/dsh-client-ui-primitives");

const COMMANDS = {
D: {
name: "d",
description: "讨论：澄清需求并落成 PLAN 计划文档",
hint: "[任务描述]",
icon: IconPlanOutlineRegular
},
G: {
name: "g",
description: "执行：按计划文档或输入文字新建会话处理",
hint: "<计划文档路径 | 任务描述>",
icon: IconPlayOutlineRegular
}
};

const RECENT_MESSAGES_KEY = "dsh-workflow-shortcuts.recentMessages";
const DEFAULT_RECENT_MESSAGES = 5;
const MIN_RECENT_MESSAGES = 1;
const MAX_RECENT_MESSAGES = 50;

/** 读取空 /G 搜索最近消息的条数；非法值回退默认 5。 */
function recentMessageLimit() {
try {
const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(RECENT_MESSAGES_KEY);
if (raw === null || String(raw).trim() === "") return DEFAULT_RECENT_MESSAGES;
const value = Number(raw);
if (!Number.isInteger(value) || value < MIN_RECENT_MESSAGES || value > MAX_RECENT_MESSAGES) {
return DEFAULT_RECENT_MESSAGES;
}
return value;
} catch {
return DEFAULT_RECENT_MESSAGES;
}
}

/** 统一斜杠路径，便于比较工作区目录。 */
function normalizePath(path) {
const source = String(path).replace(/\\/g, "/");
const absolute = source.startsWith("/");
const parts = [];
for (const segment of source.split("/")) {
if (segment === "" || segment === ".") continue;
if (segment === "..") {
if (parts.length > 0) parts.pop();
continue;
}
parts.push(segment);
}
return (absolute ? "/" : "") + parts.join("/");
}

/** 把用户输入解析为绝对路径；相对路径基于当前会话的工作目录。 */
function resolvePath(cwd, input) {
const value = String(input).trim().replace(/\\/g, "/");
if (value.startsWith("/")) return normalizePath(value);
return normalizePath(`${cwd}/${value}`);
}

function basename(path) {
const normalized = normalizePath(path);
const index = normalized.lastIndexOf("/");
return index === -1 ? normalized : normalized.slice(index + 1);
}

function discussionPrompt(task) {
return [
"1. 先讨论澄清：未明确要求前不改文件，不清楚就直接提问。",
"2. 讨论收敛后写 PLAN-*.md：首个 H1 固定为 `# PLAN：<简短标题>`（全角冒号）；最终回复末尾附 Markdown 链接，显示名用相对当前目录的路径，地址用绝对全路径。",
"3. 计划短而可执行；简单且改动位置明确的点直接顺手完成，并同步 README、STATUS、PROJECT_INDEX。",
"",
"任务：",
task.trim() || "（我还没想清楚，请先通过提问帮我澄清。）"
].join("\n");
}

/**
 * 找出文本中的计划文档引用，支持 Markdown 链接、引号/反引号路径和裸路径。
 * 只接受 .md，拒绝 http(s) 链接。
 */
function findPlanReferences(text) {
const source = String(text);
const matches = [];
const add = (match, token, startOffset, endOffset) => {
const value = String(token).trim();
if (!looksLikePlanPath(value)) return;
matches.push({
 token: value,
 start: match.index + startOffset,
 end: match.index + endOffset
});
};

const link = /\[[^\]]*\]\(\s*<?([^)\s>]+?\.md)>?\s*\)/gi;
for (let match = link.exec(source); match !== null; match = link.exec(source)) {
const offset = match[0].indexOf(match[1]);
add(match, match[1], offset, offset + match[1].length);
}

const quoted = /(?:^|\s)(["'`])([^"'`\s]+?\.md)\1(?=\s|$)/gi;
for (let match = quoted.exec(source); match !== null; match = quoted.exec(source)) {
const offset = match[0].indexOf(match[2]);
add(match, match[2], offset, offset + match[2].length);
}

const bare = /(?:^|\s)((?:[A-Za-z]:[\\/])?[^\s"'`\[\]()]+?\.md)(?=\s|$)/gi;
for (let match = bare.exec(source); match !== null; match = bare.exec(source)) {
const offset = match[0].indexOf(match[1]);
add(match, match[1], offset, offset + match[1].length);
}

matches.sort((left, right) => left.start - right.start || right.end - left.end);
const result = [];
let occupiedUntil = -1;
for (const match of matches) {
if (match.start < occupiedUntil) continue;
result.push(match);
occupiedUntil = match.end;
}
return result;
}

function findPlanReference(text) {
return findPlanReferences(text)[0];
}

function looksLikePlanPath(token) {
const value = String(token).replace(/^[<"'`]+|[>"'`]+$/g, "").trim();
if (!/\.md$/i.test(value)) return false;
if (/^(?:https?:)?\/\//i.test(value)) return false;
if (/[\\/]/.test(value)) return true;
return /^plan[-_.]/i.test(basename(value));
}

/** 解析 /G 的参数：计划文档路径，或直接输入的任务文字。 */
function parseExecutionRequest(cwd, rawArgs) {
const text = String(rawArgs).trim();
if (text === "") return { kind: "empty" };
const plan = findPlanReference(text);
if (plan !== undefined) {
const instruction = `${text.slice(0, plan.start)} ${text.slice(plan.end)}`.replace(/\s+/g, " ").trim();
return {
kind: "plan",
planPath: resolvePath(cwd, plan.token),
instruction
};
}
return { kind: "text", text };
}

function summarizeTitle(text) {
const firstLine = String(text).split(/\r?\n/).find((line) => line.trim() !== "") ?? "新任务";
const cleaned = firstLine
.replace(/^[#>*\-\s]+/, "")
.replace(/[`*_>#]/g, "")
.trim();
if (cleaned === "") return "新任务";
return cleaned.length > 36 ? `${cleaned.slice(0, 36)}…` : cleaned;
}

/** 去掉计划标题开头的「计划」或「PLAN」前缀及其后的分隔符。 */
function stripPlanPrefix(title) {
const value = String(title).trim();
const matched = /^(?:计划|PLAN)([\s：:、·｜|—–\-_]+)(.*)$/i.exec(value);
if (matched !== null) return matched[2].trim();
return /^(?:计划|PLAN)$/i.test(value) ? "" : value;
}

/**
 * 从计划文档开头提取标题：优先第一个 H1，没有则第一个 H2；忽略代码围栏内的标题。
 * 标题清洗后为空时返回 undefined，由调用方回退文件名。
 */
function planTitleFromText(text) {
let fenced = false;
let fallback;
for (const line of String(text).split(/\r?\n/)) {
const trimmed = line.trim();
if (/^(?:```|~~~)/.test(trimmed)) {
fenced = !fenced;
continue;
}
if (fenced) continue;
const h1 = /^#\s+(.+?)\s*#*\s*$/.exec(trimmed);
if (h1 !== null) {
const title = stripPlanPrefix(h1[1]);
if (title !== "") return title;
continue;
}
if (fallback === undefined) {
const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(trimmed);
if (h2 !== null) {
const title = stripPlanPrefix(h2[1]);
if (title !== "") fallback = title;
}
}
}
return fallback;
}

function executionPrompt(cwd, request) {
const lines = [
`1. 工作区：${cwd}；先读工作区 AGENTS.md，文档和代码按需查阅。`,
""
];

if (request.kind === "plan") {
lines.push("计划文档：", request.planPath);
lines.push(
"",
"2. 直接按计划执行；路径已验证。",
"3. 完成后按 AGENTS.md 验证收尾。"
);
if (request.instruction) {
lines.push("", "补充要求：", request.instruction);
}
} else {
lines.push("2. 按以下任务实施。", "任务：", request.text);
lines.push("", "3. 完成后按 AGENTS.md 验证并收尾。");
}

return lines.join("\n");
}

function apply(ctx) {
const sessions = ctx.sessions;
const workspaces = ctx.workspaces;
const uiWorkspace = ctx.uiWorkspace;

/** 从一条会话事件里提取用户/助手文本；其他事件类型返回 undefined。 */
function messageTextFromEntry(entry) {
const event = entry?.type === "event" ? entry.event : undefined;
const type = event?.type ?? entry?.type;
if (type !== "user/message" && type !== "assistant/message") return undefined;
const payload = event?.data ?? entry?.data ?? entry;
const message = payload?.message ?? payload;
const content = message?.content ?? message?.text ?? message;
if (typeof content === "string") return content;
if (!Array.isArray(content)) return undefined;
const text = content
.map((block) => {
if (typeof block === "string") return block;
if (block?.type === "text" && typeof block.text === "string") return block.text;
return "";
})
.filter((part) => part !== "")
.join("\n");
return text;
}

/** 从当前会话读取最近 N 条用户/助手消息文本（新到旧），排除 system/developer/tool。 */
async function recentMessageTexts(sessionId, limit) {
return sessions.using(sessionId, { source: "workflowShortcuts" }, async (reference) => {
const entries = reference.binding.eventSource?.getSnapshot?.()?.entries;
if (!Array.isArray(entries)) return [];
const texts = [];
for (let index = entries.length - 1; index >= 0 && texts.length < limit; index -= 1) {
const text = messageTextFromEntry(entries[index]);
if (typeof text === "string" && text.trim() !== "") texts.push(text);
}
return texts;
});
}

/** 严格校验计划文档可读；读取失败或非 ok 结果返回 false。 */
async function readablePlanPath(sessionId, planPath) {
try {
const result = await ctx.remote.workspaceFiles.read(sessionId, planPath, { offset: 1, limit: 1 });
return result?.ok === true;
} catch {
return false;
}
}

/** 从最近消息中收集可读计划候选，按规范化绝对路径去重。 */
async function collectRecentPlanCandidates(sessionId, cwd, limit) {
const texts = await recentMessageTexts(sessionId, limit);
const seen = new Set();
const candidates = [];
for (let index = 0; index < texts.length; index += 1) {
for (const reference of findPlanReferences(texts[index])) {
const planPath = resolvePath(cwd, reference.token);
if (seen.has(planPath)) continue;
seen.add(planPath);
if (await readablePlanPath(sessionId, planPath)) {
const title = await readPlanTitle(sessionId, planPath);
candidates.push({ path: planPath, title, sourceIndex: index + 1 });
}
}
}
return candidates;
}

/** 弹出计划选择框；选中返回绝对路径，取消/关闭返回 undefined。 */
function choosePlan(candidates) {
return new Promise((resolve) => {
if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.body) {
resolve(undefined);
return;
}
const dialog = document.createElement("dialog");
dialog.className = "dsh-workflow-shortcuts-plan-picker";
const title = document.createElement("h2");
title.textContent = "选择要执行的计划文档";
dialog.appendChild(title);
const list = document.createElement("div");
let settled = false;
const finish = (value) => {
if (settled) return;
settled = true;
if (typeof dialog.close === "function") dialog.close();
dialog.remove?.();
resolve(value);
};
for (const candidate of candidates) {
const button = document.createElement("button");
button.type = "button";
button.textContent = `${candidate.title ?? basename(candidate.path)}（第 ${candidate.sourceIndex} 条最近消息）\n${candidate.path}`;
button.addEventListener("click", () => finish(candidate.path));
list.appendChild(button);
}
dialog.appendChild(list);
const cancel = document.createElement("button");
cancel.type = "button";
cancel.textContent = "取消";
cancel.addEventListener("click", () => finish(undefined));
dialog.appendChild(cancel);
dialog.addEventListener("cancel", (event) => {
event?.preventDefault?.();
finish(undefined);
});
dialog.addEventListener("close", () => {
if (!settled) {
settled = true;
resolve(undefined);
}
});
document.body.appendChild(dialog);
dialog.showModal?.();
});
}

/** 读取计划文档开头并提取标题；读取失败或没有标题时返回 undefined。 */
async function readPlanTitle(sessionId, planPath) {
try {
const result = await ctx.remote.workspaceFiles.read(sessionId, planPath, { offset: 1, limit: 40 });
if (result?.ok !== true || typeof result.value?.text !== "string") return undefined;
return planTitleFromText(result.value.text);
} catch {
return undefined;
}
}

/** 计划模式优先用计划文档标题；文字模式保持任务摘要。 */
async function executionTitle(sessionId, request) {
if (request.kind === "plan") {
const planTitle = await readPlanTitle(sessionId, request.planPath);
return `G：${planTitle ?? basename(request.planPath)}`;
}
return `G：${summarizeTitle(request.text)}`;
}

function errorOutcome(error) {
return {
kind: "error",
text: error instanceof Error ? error.message : String(error)
};
}

function remoteFailure(prefix, result) {
return new Error(`${prefix}: ${result.error.code}: ${result.error.message}`);
}

function claimFor(key, session) {
const command = COMMANDS[key];
return {
name: command.name,
token: `/${key} `,
hint: command.hint,
submit: (args, _actx, attachments) =>
submit(key, session, args, attachments)
};
}

async function submit(key, session, args, attachments = []) {
if (attachments.length > 0) {
return { kind: "error", text: `/${key} 不支持附件，请先把内容写入文本。` };
}
try {
if (key === "D") {
await sendPrompt(session.sessionId, discussionPrompt(args), discussionTitle(args));
return { kind: "success" };
}
return await startExecution(session.sessionId, args);
} catch (error) {
return errorOutcome(error);
}
}

/** 讨论会话统一加 `D: ` 前缀，便于和 `/G` 的 G：会话区分。 */
function discussionTitle(task) {
const text = String(task).trim();
const summary = text === "" ? "新讨论" : summarizeTitle(text);
return `D: ${summary}`;
}

async function sendPrompt(sessionId, text, title) {
await sessions.using(sessionId, { source: "workflowShortcuts" }, async (reference) => {
if (title !== undefined) {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
}
const result = await reference.binding.session.prompt(
[{ type: "text", text }],
"queue"
);
if (!result.ok) throw remoteFailure("session.prompt", result);
});
}

async function startExecution(sessionId, rawArgs) {
const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd;
if (!cwd) throw new Error("无法确定当前会话的工作目录，/G 已取消。");
const text = String(rawArgs).trim();
let request;
if (text !== "") {
request = parseExecutionRequest(cwd, text);
} else {
const limit = recentMessageLimit();
const candidates = await collectRecentPlanCandidates(sessionId, cwd, limit);
if (candidates.length === 0) {
throw new Error(`最近 ${limit} 条消息未找到可读的 .md 计划文档。`);
}
if (candidates.length === 1) {
request = { kind: "plan", planPath: candidates[0].path, instruction: "" };
} else {
const planPath = await choosePlan(candidates);
if (planPath === undefined) return { kind: "success" };
request = { kind: "plan", planPath, instruction: "" };
}
}

const workspace = await ensureWorkspace(cwd);
const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });
const title = await executionTitle(sessionId, request);

await sessions.using(newSessionId, { source: "workflowShortcuts" }, async (reference) => {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await reference.binding.session.prompt(
[{ type: "text", text: executionPrompt(cwd, request) }],
"queue"
);
if (!prompted.ok) throw remoteFailure("session.prompt", prompted);
});

uiWorkspace.openSession(newSessionId);
return { kind: "success" };
}

async function ensureWorkspace(cwd) {
const target = normalizePath(cwd);
const existing = workspaces.list
.getSnapshot()
.items.find((workspace) => normalizePath(workspace.path) === target);
if (existing !== undefined) return existing;
return workspaces.create({ path: cwd });
}

function keyOfToken(token) {
const raw = token.startsWith("/") ? token.slice(1) : token;
return raw === "D" || raw === "G" ? raw : undefined;
}

const source = {
trigger: "/",
name: "workflow-shortcuts",
order: -1000,
showGroupTitle: false,
async candidates(session, { query, signal }) {
if (sessions.subagentAddress(session.sessionId) !== undefined) return [];
if (signal.aborted) return [];
const needle = query.trim().toUpperCase();
return Object.entries(COMMANDS)
.filter(([key]) => needle === "" || key.startsWith(needle))
.map(([key, command]) => ({
name: key,
description: command.description,
icon: command.icon
}));
},
lexicon(session) {
if (sessions.subagentAddress(session.sessionId) !== undefined) return [];
return Object.keys(COMMANDS);
},
onPick({ candidate, session }) {
const key = keyOfToken(candidate.name);
return key === undefined ? undefined : { claim: claimFor(key, session) };
},
matchSpace(session, token) {
const key = keyOfToken(token);
return key === undefined ? undefined : { claim: claimFor(key, session) };
},
matchEnter(session, line, _signal, envelope) {
const trimmed = line.trim();
const ws = trimmed.search(/\s/);
const token = ws === -1 ? trimmed : trimmed.slice(0, ws);
const key = keyOfToken(token);
if (key === undefined) return undefined;
if (envelope.attachments > 0) {
throw new Error(`/${key} 不支持附件，请先把内容写入文本。`);
}
return { claim: claimFor(key, session) };
},
matchClaim(session, token) {
const key = keyOfToken(token);
return key === undefined ? undefined : claimFor(key, session);
}
};

const inputTriggers = ctx.get("inputTriggers");
ctx.effect(() => {
const unregister = inputTriggers.registerSource(source);
return () => unregister();
}, "workflow-shortcuts: source");
}

exports.apply = apply;
exports.inject = inject;
return module.exports;
}
});
