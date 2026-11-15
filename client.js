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
description: "执行：按 PLAN 文档新建实施会话",
hint: "<计划文档路径>",
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
"我们现在进入「讨论阶段」。请先不要修改任何文件，也不要开始实施。",
"围绕下面的任务逐项澄清：目标、范围与边界、约束、关键决策、风险与坑、验收标准。",
"信息不足时直接向我提问；不要自行假设关键需求。",
"讨论收敛后，把最终方案写成一份 PLAN 文档（建议命名 PLAN-<主题>.md，放在合适目录），",
"并在回复末尾给出该文档的绝对路径。之后我会在新会话中用 /G <计划路径> 开始实施。",
"",
"任务：",
task.trim() || "（我先不提供细节，请你先问我问题，帮助我把任务讨论清楚。）"
].join("\n");
}

function executionPrompt(cwd, planPath) {
return [
"这是一个独立的实施会话，讨论历史不在本会话中。",
"请先完整阅读下面的计划文档及其中引用的文件，然后严格按计划执行：",
"",
`计划文档：${planPath}`,
`工作区根目录：${cwd}`,
"",
"要求：",
"1. 不要重新讨论已经确定的设计；如计划缺少关键信息、与当前代码冲突或存在明显风险，先停下来向我确认。",
"2. 遵守工作区 AGENTS.md 等规则，按最小变更原则实施。",
"3. 完成后更新必要文档（如 PROJECT_INDEX.md）、执行验证，并按工作区规则提交与推送。"
].join("\n");
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
const planArg = String(rawArgs).trim();
const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd;
if (!cwd) throw new Error("无法确定当前会话的工作目录，/G 已取消。");
if (planArg === "") {
throw new Error("用法：/G <计划文档路径>。例如：/G task/foo/PLAN-foo.md");
}

const planPath = resolvePath(cwd, planArg);
const workspace = await ensureWorkspace(cwd);
const newSessionId = await sessions.create({ workspaceId: workspace.workspaceId });
const title = `实施：${basename(planPath)}`;

await sessions.using(newSessionId, { source: "workflowShortcuts" }, async (reference) => {
const renamed = await reference.binding.session.rename(title);
if (!renamed.ok) throw remoteFailure("session.rename", renamed);
const prompted = await reference.binding.session.prompt(
[{ type: "text", text: executionPrompt(cwd, planPath) }],
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
