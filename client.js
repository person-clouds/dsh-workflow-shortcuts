window.__ModuleLoader__.load({
id: "dsh-workflow-shortcuts",
factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

/**
 * /D、/G、/C、/V、/VP 五个快捷命令的 Client 实现。
 *
 * Host 命令名只允许小写，所以这里注册一个独立的 `/` 输入源：
 * 菜单、空格、回车和命令 chip 恢复都返回自定义 claim，
 * submit 时直接调用 Client 的 Session 服务完成动作。
 */

const inject = ["inputTriggers", "sessions", "workspaces", "uiWorkspace", "remote", "remote.workspaceFiles"];

// 与内置 /plan、/goal 等命令使用同一套图标组件。
const { IconPlanOutlineRegular, IconPlayOutlineRegular, IconChecklistOutlineRegular } = require("@deepseek-ai/dsh-client-ui-primitives");

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
},
C: {
name: "c",
description: "问题：查 bug、核对信息并直接处理（当前会话）",
hint: "[问题描述 | 收到的信息]",
icon: IconPlayOutlineRegular
},
V: {
name: "v",
description: "核验：新建只读核验会话，检查改动是否真的生效",
hint: "[改动说明 | 快照 sha]",
icon: IconChecklistOutlineRegular
},
VP: {
name: "vp",
description: "计划核验：只读审查计划的完善性、反例与安全性",
hint: "[计划文档路径 | 空=最近消息选择]",
icon: IconChecklistOutlineRegular
}
};

const RECENT_MESSAGES_KEY = "dsh-workflow-shortcuts.recentMessages";
const DEFAULT_RECENT_MESSAGES = 5;
const MIN_RECENT_MESSAGES = 1;
const MAX_RECENT_MESSAGES = 50;
const CONFIG_GLOBAL = "__DSH_WORKFLOW_SHORTCUTS_CONFIG__";

/**
 * 去掉标题开头的一个 TODO 前缀。
 *
 * 与 Host 侧 lib/todo.js 的 PREFIX 保持一致：`TODO：标题`、`TODO: 标题`、
 * `TODO D: 标题`、`TODO G：标题`、`TODO C：标题` 都只去掉 `TODO` 与其后的一次分隔符。
 */
const TODO_PREFIX = /^TODO(?:[：:]\s*|\s+(?=[DGC][：:]))/u;
const stripTodoPrefix = (title) => String(title ?? "").replace(TODO_PREFIX, "");
const DEFAULT_DISCUSSION_PROMPT_FILE = ".dsh/workflow-shortcuts/discussion.md";
const DEFAULT_EXECUTION_PROMPT_FILE = ".dsh/workflow-shortcuts/execution.md";
const DEFAULT_VERIFY_PROMPT_FILE = ".dsh/workflow-shortcuts/verify.md";
const DEFAULT_CHECK_PROMPT_FILE = ".dsh/workflow-shortcuts/check.md";
const MAX_PROMPT_OVERLAY_LINES = 200;
const MAX_PROMPT_OVERLAY_CHARS = 8000;

/** 只保留非空字符串，并去掉首尾空白；缺失或非法值按未配置处理。 */
function configDocPath(value) {
return typeof value === "string" ? value.trim() : "";
}

/** 每次 /D、/G、/V 提交时读取当前注入配置，允许页面配置更新后无需重载代码。 */
function workflowConfig() {
try {
const raw = typeof window === "undefined" ? undefined : window[CONFIG_GLOBAL];
return {
workflowDoc: configDocPath(raw?.workflowDoc),
planDoc: configDocPath(raw?.planDoc),
planTemplate: configDocPath(raw?.planTemplate),
discussionPromptFile: configDocPath(raw?.discussionPromptFile),
executionPromptFile: configDocPath(raw?.executionPromptFile),
verifyPromptFile: configDocPath(raw?.verifyPromptFile),
checkPromptFile: configDocPath(raw?.checkPromptFile)
};
} catch {
return {
workflowDoc: "",
planDoc: "",
planTemplate: "",
discussionPromptFile: "",
executionPromptFile: "",
verifyPromptFile: "",
checkPromptFile: ""
};
}
}

/** 空值回退默认文件；none/off/-（大小写不敏感）表示关闭附加要求。 */
function resolveOverlayFile(value, fallback) {
const text = configDocPath(value);
if (text === "") return fallback;
return /^(?:none|off|-)$/i.test(text) ? "" : text;
}

/** 解析附加要求文件的路径；相对路径基于会话工作目录，没有 cwd 时返回空串。 */
function overlayPath(cwd, file) {
if (file === "") return "";
const value = String(file).trim();
if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return normalizePath(value);
return cwd ? resolvePath(cwd, value) : "";
}

/** 截断过长的附加要求，避免把整篇文档塞进提示词。 */
function clipPromptOverlay(text) {
const value = String(text).trim();
if (value.length <= MAX_PROMPT_OVERLAY_CHARS) return value;
return `${value.slice(0, MAX_PROMPT_OVERLAY_CHARS).trimEnd()}\n…（已截断，超过 ${MAX_PROMPT_OVERLAY_CHARS} 字符）`;
}

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

function discussionPrompt(task, overlay = "") {
const config = workflowConfig();
const specs = [];
if (config.workflowDoc !== "") specs.push(`- 工作流规范：${config.workflowDoc}`);
if (config.planDoc !== "") specs.push(`- 计划规范：${config.planDoc}`);
if (config.planTemplate !== "") specs.push(`- 计划模板：${config.planTemplate}`);
const planLine = specs.length === 0
? "2. 确认后按当前工作区/仓库既有规范写 PLAN-*.md。"
: `2. 确认后写 PLAN-*.md，遵循以下规范：\n${specs.join("\n")}`;
const lines = [
"You are a senior software architect.",
"",
"说明：本命令只做内容探索与计划；bugfix、线上异常处理请改用 /C。",
"1. 读 PROJECT_INDEX，内容探索（并非既定流程的bugfix），讨论时不要直接干",
planLine,
"3. 计划简短可执行；已定位的bugfix直接做并说明；维护好 README/STATUS/PROJECT_INDEX",
"4. 交付计划前按 plan-verify 自检：事实、反例、安全、验收可判定；未核实的标「待验证」。"
];
if (overlay !== "") lines.push("", "附加要求：", overlay);
lines.push(
"",
"任务：",
task.trim() || "（我还没想清楚，请先通过提问帮我澄清。）"
);
return lines.join("\n");
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

function executionPrompt(cwd, request, overlay = "") {
const lines = [
"You are a senior software development expert.",
"",
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

if (overlay !== "") lines.push("", "附加要求：", overlay);

return lines.join("\n");
}

/**
 * 核验会话提示词：只读、默认一轮（派单 prompt 写 verify-again 才加 1 轮）、只报告不改。
 *
 * 预算与只读由 context-guard 的核验态强制（标题 `V：`），
 * 这里的文字只是行为规范；阈值不在提示词里重复。
 */
function verifyPrompt(snapshot, task, overlay = "") {
const sha = String(snapshot).trim();
const scope = String(task).trim();
const lines = [
"You are a senior software testing expert.",
"",
"只读核验会话：只核执行结果与行为是否生效；不改代码、不提交、不装依赖、不重启服务。",
""
];
if (sha !== "") lines.push(`快照：${sha}`);
lines.push(
"步骤：",
"1. 按 change-verify 技能的步骤核验（未加载时按同义步骤：读本次改动、跑验收命令、核对实际行为）。",
"2. 默认 1 轮收敛；本轮未通过就以「不通过」收尾，不要自行加轮次；确需复核时由派单方在 prompt 写 `verify-again`，才允许再加 1 轮。",
"3. 只报告，不改代码；发现问题指出文件:行与建议修补要点。",
""
);
if (scope !== "") lines.push("核验范围：", scope, "");
lines.push(
"报告格式：",
"- 结论：通过 / 不通过（一句话）。",
"- 问题清单：严重度 + 文件:行 + 现象 + 建议。",
"- 需要你执行：列出要主会话执行的命令或条目；没有就写「无」。"
);
if (overlay !== "") lines.push("", "附加要求：", overlay);
return lines.join("\n");
}

/** 计划核验提示词里抹掉快照标记，避免从历史消息带入派单去重键。 */
function withoutSnapshotText(text) {
return String(text ?? "").replace(/(?:快照|snapshot)[：:]\s*[0-9a-f]{7,40}/gi, "快照：<已省略>");
}

/**
 * 计划核验会话提示词：只审计划，不实施；不写快照，同一计划可反复审。
 *
 * 只带计划路径与核验重点，不粘贴计划正文或原消息摘录：计划通常很长，
 * 粘贴既费 token，也会和「核验重点」「附加要求」重复。
 * 预算与只读同样由 context-guard 的核验态（标题 `V：`）强制。
 */
function planVerifyPrompt(planPath, focus, overlay = "") {
const focusText = withoutSnapshotText(focus).trim();
const overlayText = withoutSnapshotText(overlay).trim();
const lines = [
"You are a senior technical plan reviewer.",
"",
"只读计划核验会话：只审查计划文档本身；不实施、不改文件、不提交、不装依赖、不重启服务。",
"",
`计划文档：${planPath}`,
""
];
if (focusText !== "") lines.push("核验重点：", focusText, "");
lines.push(
"步骤：",
"1. 按 plan-verify 技能的步骤核验（未加载时按同义步骤：目标对齐、事实、可执行性、验收可判定、反例与安全、文档一致性）。",
"2. 只读核验；不执行计划里的验收命令，只确认命令存在且结果可判定。",
"3. 默认 1 轮收敛；仍未收敛就按「需修订/不可执行」收尾；确需复核时由派单方在 prompt 写 `verify-again`，才允许再加 1 轮。",
"4. 只报告，不改计划；阻断项给文件:行与建议补法。",
"",
"报告格式：",
"- 结论：可执行 / 需修订 / 不可执行（一句话）。",
"- 阻断项：严重度 + 位置 + 问题 + 证据 + 建议。",
"- 缺口与反例：未验证事实、边界/失败/并发/回滚。",
"- 需要你执行：补充证据或决策；没有就写「无」。"
);
if (overlayText !== "") lines.push("", "附加要求：", overlayText);
return lines.join("\n");
}

/**
 * 问题处理提示词：当前会话直接查因、核对信息并处理小问题。
 *
 * 只读与授权只是提示词约束，不是硬拦；`V：` 标题的只读硬拦由启动前检查规避。
 */
function checkPrompt(task, overlay = "") {
const lines = [
"You are a senior software troubleshooting expert.",
"",
"1. 先查证再下结论：核对收到的信息与现象（日志、报错、复现步骤、改动 diff），信息不足就先提问，不要凭空猜测。",
"2. 已定位的小问题直接修并说明；需要方案讨论或跨模块改造时交回 /D。",
"3. 生产/共享环境只读诊断：重启、删改数据、改权限、装依赖、发布都必须先获得明确授权。",
"4. 不写 PLAN-*.md；需要先出方案时交回 /D；修复后按 AGENTS.md 验证并说明验证方式。"
];
if (overlay !== "") lines.push("", "附加要求：", overlay);
lines.push(
"",
"任务：",
String(task).trim() || "（我还没说清问题，请先通过提问帮我确认现象、环境与范围。）"
);
return lines.join("\n");
}

/** `C：<摘要>`，空参数用 `C：查问题`。 */
function checkTitle(task) {
const text = String(task).trim();
return `C：${text === "" ? "查问题" : summarizeTitle(text)}`;
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

/** 读取提示词的附加要求文件；缺失、不可读或为空时返回空串，不阻断命令。 */
async function promptOverlay(sessionId, cwd, file) {
const path = overlayPath(cwd, file);
if (path === "") return "";
try {
const result = await ctx.remote.workspaceFiles.read(sessionId, path, {
offset: 1,
limit: MAX_PROMPT_OVERLAY_LINES
});
if (result?.ok !== true || typeof result.value?.text !== "string") return "";
return clipPromptOverlay(result.value.text);
} catch {
return "";
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
function choosePlan(candidates, titleText = "选择要执行的计划文档") {
return new Promise((resolve) => {
if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.body) {
resolve(undefined);
return;
}
const dialog = document.createElement("dialog");
dialog.className = "dsh-workflow-shortcuts-plan-picker";
const title = document.createElement("h2");
title.textContent = titleText;
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
// 声明支持附件：composer 才会序列化草稿附件并随 submit 传入。
attachments: true,
submit: (args, _actx, attachments) =>
submit(key, session, args, attachments)
};
}

/**
 * `/ok`：只清除当前会话标题的 TODO 前缀，不归档、不改动会话内容。
 *
 * 标题是 session 的 projection，不在 SessionSnapshot 上；读
 * `getSnapshot().title` 永远得到空串，必须经 `projections.faceOf("title")`。
 */
function okClaim(session) {
return {
name: "ok",
token: "/ok ",
submit: async () => {
let hadTodo = false;
try {
await sessions.using(session.sessionId, { source: "workflowShortcuts" }, async (reference) => {
const bindingSession = reference.binding.session;
const title = String(bindingSession.projections.faceOf("title").getSnapshot() ?? "");
const next = stripTodoPrefix(title);
hadTodo = next !== title;
if (!hadTodo) return;
const renamed = await bindingSession.rename(next);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
});
} catch (error) {
return {
kind: "error",
text: `操作失败：${error instanceof Error ? error.message : String(error)}`
};
}
return {
kind: "success",
text: hadTodo ? "已清除 TODO，不归档会话" : "当前没有 TODO 标记，不归档会话"
};
}
};
}

async function submit(key, session, args, attachments = []) {
// 文件回执只在接收它的会话内有效，新建会话拿不到，因此 /G、/V、/VP 只收图片。
const images = attachments.filter((attachment) => attachment?.type === "image");
if (key !== "D" && key !== "C" && images.length !== attachments.length) {
return { kind: "error", text: fileAttachmentNotice(key) };
}
try {
if (key === "D") {
const cwd = sessions.list.getSnapshot().byId[session.sessionId]?.cwd;
const config = workflowConfig();
const file = resolveOverlayFile(config.discussionPromptFile, DEFAULT_DISCUSSION_PROMPT_FILE);
const overlay = await promptOverlay(session.sessionId, cwd, file);
await sendPrompt(
session.sessionId,
discussionPrompt(args, overlay),
discussionTitle(args),
attachments
);
return { kind: "success" };
}
if (key === "C") return await startCheck(session.sessionId, args, attachments);
if (key === "V") return await startVerification(session.sessionId, args, images);
if (key === "VP") return await startPlanVerification(session.sessionId, args, images);
return await startExecution(session.sessionId, args, images);
} catch (error) {
return errorOutcome(error);
}
}

/** /G、/V、/VP 拒绝文件附件时的统一说明。 */
function fileAttachmentNotice(key) {
return `/${key} 暂不支持文件附件（文件回执只对当前会话有效），请把文件路径写入任务或计划，或改用 /D、/C 在当前会话带文件；图片附件可以直接带。`;
}

/** 讨论会话统一加 `D: ` 前缀，便于和 `/G` 的 G：会话区分。 */
function discussionTitle(task) {
const text = String(task).trim();
const summary = text === "" ? "新讨论" : summarizeTitle(text);
return `D: ${summary}`;
}

/** 与原生 composer 一致：附件在前，文本在后。 */
function promptParts(text, attachments = []) {
return [...attachments, { type: "text", text }];
}

async function sendPrompt(sessionId, text, title, attachments = []) {
await sessions.using(sessionId, { source: "workflowShortcuts" }, async (reference) => {
if (title !== undefined) {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
}
const result = await reference.binding.session.prompt(
promptParts(text, attachments),
"queue"
);
if (!result.ok) throw remoteFailure("session.prompt", result);
});
}

async function startExecution(sessionId, rawArgs, images = []) {
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
const title = await executionTitle(sessionId, request);
const config = workflowConfig();
const file = resolveOverlayFile(config.executionPromptFile, DEFAULT_EXECUTION_PROMPT_FILE);
const overlay = await promptOverlay(sessionId, cwd, file);

const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });

await sessions.using(newSessionId, { source: "workflowShortcuts" }, async (reference) => {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await reference.binding.session.prompt(
promptParts(executionPrompt(cwd, request, overlay), images),
"queue"
);
if (!prompted.ok) throw remoteFailure("session.prompt", prompted);
});

uiWorkspace.openSession(newSessionId);
return { kind: "success" };
}

/**
 * 计划核验会话：标题仍以 `V：` 开头，复用 guard 的只读与预算；
 * 空参数从最近消息里选计划；提示词只带计划路径与核验重点，不粘贴计划正文或原消息，
 * 也不带可参与去重的 `快照：<sha>` 键，同一计划可反复审。
 */
async function startPlanVerification(sessionId, rawArgs, images = []) {
const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd;
if (!cwd) throw new Error("无法确定当前会话的工作目录，/VP 已取消。");
const text = String(rawArgs).trim();
let request;
if (text !== "") {
const parsed = parseExecutionRequest(cwd, text);
if (parsed.kind !== "plan") {
throw new Error("未找到 .md 计划文档路径；用法：/VP [计划文档路径] [核验重点]");
}
request = { kind: "plan", planPath: parsed.planPath, instruction: parsed.instruction };
} else {
const limit = recentMessageLimit();
const candidates = await collectRecentPlanCandidates(sessionId, cwd, limit);
if (candidates.length === 0) {
throw new Error(`最近 ${limit} 条消息未找到可读的 .md 计划文档。`);
}
if (candidates.length === 1) {
request = { kind: "plan", planPath: candidates[0].path, instruction: "" };
} else {
const planPath = await choosePlan(candidates, "选择要核验的计划文档");
if (planPath === undefined) return { kind: "success" };
request = { kind: "plan", planPath, instruction: "" };
}
}

const planTitle = await readPlanTitle(sessionId, request.planPath);
const summary = planTitle === undefined || planTitle === "" ? basename(request.planPath) : planTitle;
const title = `V：计划：${summarizeTitle(summary)}`;

const workspace = await ensureWorkspace(cwd);
const config = workflowConfig();
const file = resolveOverlayFile(config.verifyPromptFile, DEFAULT_VERIFY_PROMPT_FILE);
const overlay = await promptOverlay(sessionId, cwd, file);

const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });

await sessions.using(newSessionId, { source: "workflowShortcuts" }, async (reference) => {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await reference.binding.session.prompt(
promptParts(planVerifyPrompt(request.planPath, request.instruction, overlay), images),
"queue"
);
if (!prompted.ok) throw remoteFailure("session.prompt", prompted);
});

uiWorkspace.openSession(newSessionId);
return { kind: "success" };
}

/** 核验会话：标题 `V：…`，context-guard 据此切只读与核验预算。 */
async function startVerification(sessionId, rawArgs, images = []) {
const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd;
if (!cwd) throw new Error("无法确定当前会话的工作目录，/V 已取消。");
const text = String(rawArgs).trim();
const snapshotMatch = text.match(/(?:快照|snapshot)[：:]\s*([0-9a-f]{7,40})/i);
const snapshot = snapshotMatch === null ? "" : snapshotMatch[1];
const scope = snapshotMatch === null ? text : text.replace(snapshotMatch[0], "").replace(/^[\s,，;；]+/, "").trim();
const title = `V：${scope === "" ? "核验改动" : summarizeTitle(scope)}`;

const workspace = await ensureWorkspace(cwd);
const config = workflowConfig();
const file = resolveOverlayFile(config.verifyPromptFile, DEFAULT_VERIFY_PROMPT_FILE);
const overlay = await promptOverlay(sessionId, cwd, file);

const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });

await sessions.using(newSessionId, { source: "workflowShortcuts" }, async (reference) => {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await reference.binding.session.prompt(
promptParts(verifyPrompt(snapshot, scope, overlay), images),
"queue"
);
if (!prompted.ok) throw remoteFailure("session.prompt", prompted);
});

uiWorkspace.openSession(newSessionId);
return { kind: "success" };
}

/**
 * 问题处理：只在当前会话改名并发提示词，不新建会话、不打开别的会话。
 *
 * `V：`（含 `TODO：V：`、`TODO: V：`）是 context-guard 的只读核验态；
 * 先读当前标题，命中就返回错误且不改标题，避免用 /C 改名绕过只读硬拦。
 */
async function startCheck(sessionId, rawArgs, attachments = []) {
const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd;
const text = String(rawArgs).trim();
const blockedTitle = await sessions.using(sessionId, { source: "workflowShortcuts" }, async (reference) => {
const bindingSession = reference.binding.session;
const current = String(bindingSession.projections.faceOf("title").getSnapshot() ?? "");
if (/^(?:TODO[：:]\s*)?V[：:]/u.test(current)) return current;
const config = workflowConfig();
const file = resolveOverlayFile(config.checkPromptFile, DEFAULT_CHECK_PROMPT_FILE);
const overlay = await promptOverlay(sessionId, cwd, file);
const renamed = await bindingSession.rename(checkTitle(text));
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await bindingSession.prompt(
promptParts(checkPrompt(text, overlay), attachments),
"queue"
);
if (!prompted.ok) throw remoteFailure("session.prompt", prompted);
return undefined;
});
if (blockedTitle !== undefined) {
return {
kind: "error",
text: `当前会话是只读核验会话（${blockedTitle}），不能执行 /C；请在普通会话处理问题。`
};
}
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
return raw === "D" || raw === "G" || raw === "C" || raw === "V" || raw === "VP" ? raw : undefined;
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
matchEnter(session, line) {
const trimmed = line.trim();
const ws = trimmed.search(/\s/);
const token = ws === -1 ? trimmed : trimmed.slice(0, ws);
const key = keyOfToken(token);
if (key === undefined) return undefined;
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

// 独立的 `/ok` 输入源：不改动上面的 /D、/G 源，二者互不影响。
ctx.effect(() => inputTriggers.registerSource({
trigger: "/",
name: "dsh-workflow-shortcuts-todo",
order: 30,
showGroupTitle: false,
candidates: async () => [
{ name: "ok", label: "/ok", description: "清除当前会话的 TODO 标记，不归档会话" }
],
matchSpace: (session, token) => token.toLowerCase() === "/ok" ? { claim: okClaim(session) } : undefined,
matchEnter: async (session, line) => line.trim().toLowerCase() === "/ok" ? { claim: okClaim(session) } : undefined,
onPick: (pick) => pick.candidate.name === "ok" ? { claim: okClaim(pick.session) } : undefined
}), "workflow-shortcuts: /ok source");
}

exports.apply = apply;
exports.inject = inject;
return module.exports;
}
});
