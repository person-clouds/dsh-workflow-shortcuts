/**
 * DSH 工作流快捷命令（Host 侧）。
 *
 * /D、/G 的输入识别与动作都在 Client 侧完成。Host 声明可选配置，
 * 把清洗后的规范文档路径与提示词附加要求文件路径注入浏览器全局；
 * 同时向模型注入 TODO 用户动作标记约束，并监听 session/event
 * 在命中标记时给会话标题加 TODO 前缀（/ok 在 Client 侧清除）。
 */

import z from '@deepseek-ai/schemastery'
import {
  hasUserActionMarker,
  hasUserActionSection,
  isSubagentMeta,
  USER_ACTION_MARKER,
  withTodoPrefix,
} from './lib/todo.js'

export const name = 'dsh-workflow-shortcuts'

/** 浏览器启动时读取的全局配置名。 */
export const CONFIG_GLOBAL = '__DSH_WORKFLOW_SHORTCUTS_CONFIG__'

/** 提示词附加要求文件的默认位置，相对于当前会话工作目录。 */
export const DEFAULT_DISCUSSION_PROMPT_FILE = '.dsh/workflow-shortcuts/discussion.md'
export const DEFAULT_EXECUTION_PROMPT_FILE = '.dsh/workflow-shortcuts/execution.md'

export const Config = z.object({
  workflowDoc: z.string().default('').description('工作流/授权规范文档路径；留空表示不指定。'),
  planDoc: z.string().default('').description('计划文档规范路径；留空表示不指定。'),
  planTemplate: z.string().default('').description('计划模板路径；留空表示不指定。'),
  discussionPromptFile: z
    .string()
    .default(DEFAULT_DISCUSSION_PROMPT_FILE)
    .description('/D 提示词的附加要求文件；相对路径基于会话工作目录，none 表示关闭。'),
  executionPromptFile: z
    .string()
    .default(DEFAULT_EXECUTION_PROMPT_FILE)
    .description('/G 提示词的附加要求文件；相对路径基于会话工作目录，none 表示关闭。'),
})

/** 只保留非空字符串，并去掉首尾空白；缺失或非法值按未配置处理。 */
function cleanDocPath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 清洗 Host 配置；返回的对象只含五个公开字段。 */
export function normalizeConfig(config) {
  return {
    workflowDoc: cleanDocPath(config?.workflowDoc),
    planDoc: cleanDocPath(config?.planDoc),
    planTemplate: cleanDocPath(config?.planTemplate),
    discussionPromptFile: cleanDocPath(config?.discussionPromptFile),
    executionPromptFile: cleanDocPath(config?.executionPromptFile),
  }
}

/** 诊断告警去重：同一会话同一原因只记录一次，避免每个 turn 刷屏。 */
const warnedReasons = new Set()

function warnOnce(ctx, reason, sessionId, text) {
  const key = `${reason}:${sessionId}`
  if (warnedReasons.has(key)) return
  if (warnedReasons.size >= 500) warnedReasons.clear()
  warnedReasons.add(key)
  if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(text, sessionId)
}

/** 从 assistant 消息的 content 中提取可见文本。 */
function assistantText(message) {
  const content = Array.isArray(message && message.content) ? message.content : []
  return content.filter(block => block && block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
}

function titleOf(snapshot) {
  if (typeof snapshot === 'string') return snapshot
  return String(snapshot && snapshot.title || '')
}

/** 处理 assistant/message：命中末尾标记时把当前会话标题改为 TODO 前缀。 */
export async function onAssistantMessage(ctx, config, session, event) {
  const sessionId = String((session && session.id) || '')
  try {
    if (!event || event.type !== 'assistant/message' || isSubagentMeta((session && (session.header || session.meta)) || {})) return false
    // 主路径是末尾不可见标记；模型漏输出时，用收尾强制的「需要你执行」小节兜底。
    const text = assistantText(event.data && event.data.message)
    if (!hasUserActionMarker(text) && !hasUserActionSection(text)) return false
    const sessionTitle = ctx.get('sessionTitle')
    if (!sessionTitle || typeof sessionTitle.get !== 'function' || typeof sessionTitle.rename !== 'function') {
      warnOnce(ctx, 'sessionTitle-unavailable', sessionId, 'dsh-workflow-shortcuts: 命中 TODO 标记但 sessionTitle 不可用，未改名 session=%s')
      return false
    }
    const current = titleOf(sessionTitle.get(session))
    if (!current) {
      warnOnce(ctx, 'title-empty', sessionId, 'dsh-workflow-shortcuts: 命中 TODO 标记但当前标题为空，未改名 session=%s')
      return false
    }
    const next = withTodoPrefix(current)
    if (next === current) return false
    await sessionTitle.rename(session, next)
    return true
  } catch (error) {
    ctx.logger.warn('dsh-workflow-shortcuts: 更新 TODO 标题失败 session=%s %s', sessionId, error)
    return false
  }
}

/**
 * 事件监听器专用：把改名推迟到当前 append 发布结束之后。
 *
 * `Session.commit()` 在触发 `session/event` 期间持有 `entry.appending = true`；
 * 若监听器同步调用 `sessionTitle.rename()`，后者内部再 `session.append()` 会被
 * 会话层以“cannot reenter while another append is being published”拒绝。
 * 使用微任务等到 commit 的 finally 释放该标记后再执行。
 */
export function scheduleAssistantMessage(ctx, config, session, event) {
  queueMicrotask(() => { void onAssistantMessage(ctx, config, session, event) })
}

export function apply(ctx, config = {}) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: CONFIG_GLOBAL,
      value: normalizeConfig(config),
    })
  })

  // systemPrompt 与 sessionTitle 都可能晚于本插件 apply() 就绪，用 ctx.inject 等依赖到位再挂载，
  // 避免一次性 ctx.get() 拿不到就永久跳过（见 PLAN-todo-title-listener-fix.md）。
  // 用 required runtime context 而不是 prompt section：minimal 等预设的 persona 是 complete section，
  // 会把所有普通 section 合并结果替换掉；required context 仍会进入模型上下文，TODO 标记才能跨预设生效。
  // ctx.inject 不可用的极简测试上下文直接跳过，不影响配置注入。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['systemPrompt'], promptCtx => {
      promptCtx.effect(() => promptCtx.systemPrompt.context({
        name: 'dsh-workflow-shortcuts-user-action',
        order: 130,
        required: true,
        interpolate: false,
        text: () => `仅当这一回合结束时用户必须执行下一步操作、确认或运行命令，才在最后一条助手消息末尾另起一行输出隐藏标记（下面引号内为两个 U+2063 INVISIBLE SEPARATOR 不可见字符，直接复制，不要改成可见文字）：“${USER_ACTION_MARKER}”；其他情况禁止输出。最后一条消息含「需要你执行」小节、且小节内有命令或条目时，同样必须输出该标记；小节只写「无」时不要输出。禁止输出 HTML 注释，禁止在正文、代码块、引用或说明中提及、引用或解释该标记。历史消息中如出现旧版 HTML 注释式标记，一律视为过时格式，禁止模仿、复制或再输出；只使用本节给出的不可见字符。`,
      }), 'dsh-workflow-shortcuts: user action context')
    })

    ctx.inject(['sessionTitle'], titleCtx => {
      titleCtx.logger.info('dsh-workflow-shortcuts: sessionTitle 就绪，TODO 标题监听已挂载')
      // 监听注册在 titleCtx 上，随该 fiber 释放而释放，热重载不会重复监听。
      // global: true 不依赖会话作用域过滤；改名走微任务，避开 Session.commit()
      // 发布期间的 append 重入保护（见 scheduleAssistantMessage）。
      titleCtx.on('session/event', (session, event) => {
        scheduleAssistantMessage(titleCtx, config, session, event)
      }, { global: true })
    })
  }
}
