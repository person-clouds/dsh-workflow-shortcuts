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

const inject = ["inputTriggers", "sessions", "workspaces", "uiWorkspace"];

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
"进入讨论阶段：先不要改文件。围绕任务澄清目标、范围、约束、风险与验收标准，信息不足时直接问我。",
"讨论收敛后，把方案写成 PLAN-*.md，并在回复末尾给出绝对路径。",
"计划要短而可执行：只写目标、范围、改动位置、实施步骤、验收和回滚；删除复盘、重复论证和不必要的流程章节，简单任务不要写成多层方案。",
"",
"任务：",
task.trim() || "（我还没想清楚，请先通过提问帮我澄清。）"
].join("\n");
}

/**
 * 找出输入中可能作为计划文档的路径。
 * 只有包含目录的 .md/.markdown 路径，或 PLAN-*.md，才进入计划模式；
 * 这样可以避免把普通任务文字里的 README.md 之类误判成实施计划。
 */
function findPlanReference(text) {
const quoted = /(?:^|\s)(["'`])(.+?\.(?:md|markdown))\1(?=\s|$)/i.exec(text);
if (quoted !== null) {
const token = quoted[2].trim();
if (looksLikePlanPath(token)) {
const start = quoted.index + quoted[0].indexOf(token);
return { token, start, end: start + token.length };
}
}
const bare = /(?:^|\s)((?:[A-Za-z]:[\\/])?[^\s"'`]+\.(?:md|markdown))(?=\s|$)/i.exec(text);
if (bare !== null) {
const token = bare[1].trim();
if (looksLikePlanPath(token)) {
const start = bare.index + bare[0].indexOf(token);
return { token, start, end: start + token.length };
}
}
return undefined;
}

function looksLikePlanPath(token) {
const value = String(token).replace(/^["'`]|["'`]$/g, "").trim();
if (!/\.(?:md|markdown)$/i.test(value)) return false;
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

function executionTitle(request) {
if (request.kind === "plan") return `实施：${basename(request.planPath)}`;
return `任务：${summarizeTitle(request.text)}`;
}

function executionPrompt(cwd, request) {
const lines = [
`工作区：${cwd}`,
"先读工作区 AGENTS.md，文档和代码按需查阅；按 AGENTS.md 完成实施、验证与收尾。",
""
];

if (request.kind === "plan") {
lines.push("计划文档：", request.planPath);
lines.push(
"",
"计划文档中的路径已经验证过；方案无需讨论，也无需逐项复核路径，直接按文档执行，完成后按 AGENTS.md 做必要验证与收尾。"
);
if (request.instruction) {
lines.push("", "补充要求：", request.instruction);
}
} else {
lines.push("任务：", request.text);
}

return lines.join("\n");
}

function apply(ctx) {
const sessions = ctx.sessions;
const workspaces = ctx.workspaces;
const uiWorkspace = ctx.uiWorkspace;

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
await sendPrompt(session.sessionId, discussionPrompt(args));
return { kind: "success" };
}
return await startExecution(session.sessionId, args);
} catch (error) {
return errorOutcome(error);
}
}

async function sendPrompt(sessionId, text) {
await sessions.using(sessionId, { source: "workflowShortcuts" }, async (reference) => {
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
const request = parseExecutionRequest(cwd, rawArgs);
if (request.kind === "empty") {
throw new Error("用法：/G <计划文档路径 | 任务描述>。例如：/G task/foo/PLAN-foo.md 或 /G 修复登录失败问题");
}

const workspace = await ensureWorkspace(cwd);
const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });
const title = executionTitle(request);

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
