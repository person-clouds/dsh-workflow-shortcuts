import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

import { USER_ACTION_MARKER } from '../lib/todo.js'

/**
 * Host 测试不依赖已安装的 DSH 依赖：把 schemastery 换成本用例需要的最小实现。
 * 真正运行时仍由 DSH profile 提供 @deepseek-ai/schemastery。
 */
const SCHEMA_STUB = `
function string() {
  const schema = {
    type: 'string',
    defaultValue: undefined,
    default(value) {
      schema.defaultValue = value
      return schema
    },
    description() {
      return schema
    }
  }
  return schema
}
function object(shape) {
  const schema = function validate(value = {}) {
    const result = {}
    for (const [key, field] of Object.entries(shape)) {
      if (Object.hasOwn(value, key) && value[key] !== undefined) result[key] = value[key]
      else if (field.defaultValue !== undefined) result[key] = field.defaultValue
    }
    return result
  }
  schema.shape = shape
  return schema
}
export default { string, object }
`

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/schemastery') {
      return { url: `data:text/javascript,${encodeURIComponent(SCHEMA_STUB)}`, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  }
})

const {
  Config,
  CONFIG_GLOBAL,
  DEFAULT_DISCUSSION_PROMPT_FILE,
  DEFAULT_EXECUTION_PROMPT_FILE,
  DEFAULT_VERIFY_PROMPT_FILE,
  apply,
  name,
  normalizeConfig,
  onAssistantMessage,
  scheduleAssistantMessage
} = await import('../index.js')

test('Host：Config 默认值', () => {
  assert.equal(name, 'dsh-workflow-shortcuts')
  assert.deepEqual(Config(), {
    workflowDoc: '',
    planDoc: '',
    planTemplate: '',
    discussionPromptFile: DEFAULT_DISCUSSION_PROMPT_FILE,
    executionPromptFile: DEFAULT_EXECUTION_PROMPT_FILE,
    verifyPromptFile: DEFAULT_VERIFY_PROMPT_FILE
  })
})

test('Host：normalizeConfig 只保留清洗后的六个字符串字段', () => {
  assert.deepEqual(normalizeConfig(), {
    workflowDoc: '',
    planDoc: '',
    planTemplate: '',
    discussionPromptFile: '',
    executionPromptFile: '',
    verifyPromptFile: ''
  })
  assert.deepEqual(
    normalizeConfig({
      workflowDoc: ' /a.md ',
      planDoc: 42,
      planTemplate: '   ',
      discussionPromptFile: ' prompts/d.md ',
      executionPromptFile: 'none',
      verifyPromptFile: ' prompts/v.md ',
      extra: 'ignored'
    }),
    {
      workflowDoc: '/a.md',
      planDoc: '',
      planTemplate: '',
      discussionPromptFile: 'prompts/d.md',
      executionPromptFile: 'none',
      verifyPromptFile: 'prompts/v.md'
    }
  )
})

test('Host：webserver/index-inject 注入清洗后的全局配置', () => {
  let listener
  const ctx = {
    on(event, handler) {
      assert.equal(event, 'webserver/index-inject')
      listener = handler
    }
  }
  apply(ctx, {
    workflowDoc: ' /home/zh/www/_meta/doc/task-workflow.md ',
    planDoc: ' /home/zh/www/doc/specs/documentation-rules.md ',
    planTemplate: null,
    discussionPromptFile: ' prompts/discussion.md ',
    executionPromptFile: ' /tmp/execution.md ',
    verifyPromptFile: ' /tmp/verify.md ',
    extra: 'ignored'
  })
  assert.equal(typeof listener, 'function')

  const table = []
  listener(table)
  assert.deepEqual(table, [{
    kind: 'global',
    name: CONFIG_GLOBAL,
    value: {
      workflowDoc: '/home/zh/www/_meta/doc/task-workflow.md',
      planDoc: '/home/zh/www/doc/specs/documentation-rules.md',
      planTemplate: '',
      discussionPromptFile: 'prompts/discussion.md',
      executionPromptFile: '/tmp/execution.md',
      verifyPromptFile: '/tmp/verify.md'
    }
  }])
})

test('Host：未配置时注入空配置，仍固定六个字段', () => {
  let listener
  apply({ on(_event, handler) { listener = handler } })
  const table = []
  listener(table)
  assert.deepEqual(table[0], {
    kind: 'global',
    name: '__DSH_WORKFLOW_SHORTCUTS_CONFIG__',
    value: {
      workflowDoc: '',
      planDoc: '',
      planTemplate: '',
      discussionPromptFile: '',
      executionPromptFile: '',
      verifyPromptFile: ''
    }
  })
})

/**
 * TODO 标题用例迁移自 dsh-workbench 的 Host 测试：去掉标题缓存与临时目录，
 * 只验证 systemPrompt 约束注入、session/event 监听与改名行为。
 */

function todoFixture(options = {}) {
  const calls = []
  const warnings = []
  let current = options.title ?? '修复登录'
  const session = {
    id: options.id ?? 's1',
    header: { cwd: '/tmp/ws', origin: options.origin, delegationDepth: options.delegationDepth },
    meta: {}
  }
  const sessionTitle = {
    get: (value) => ({ title: value === session ? current : '' }),
    rename: async (value, title) => {
      assert.equal(value, session)
      calls.push(title)
      current = title
    }
  }
  const sessions = { get: (id) => (id === session.id ? session : undefined) }
  const ctx = {
    logger: { warn: (...args) => warnings.push(args) },
    get: (name) => (options.noTitleService ? { sessions } : { sessions, sessionTitle })[name]
  }
  return { ctx, session, calls, warnings, title: () => current }
}

function todoMessage(text) {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } }
}

/** 模拟插件上下文：记录 inject 回调与事件监听，服务初始都不可用。 */
function applyFixture() {
  const injections = new Map()
  const listeners = []
  const infos = []
  const warnings = []
  const ctx = {
    logger: { info: (message) => infos.push(message), warn: (message) => warnings.push(message) },
    get: () => undefined,
    effect: (fn) => {
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    on: (event, handler) => listeners.push({ event, handler }),
    inject: (names, callback) => {
      injections.set(names.join(','), callback)
      return Promise.resolve()
    }
  }
  return { ctx, injections, listeners, infos, warnings }
}

/** systemPrompt service 晚到后注入回调用的子上下文。 */
function promptChild(registrations) {
  return {
    systemPrompt: {
      section: (options) => { registrations.sections.push(options); return () => {} },
      context: (options) => { registrations.contexts.push(options); return () => {} }
    },
    effect: (fn) => fn()
  }
}

test('Host：systemPrompt 与 sessionTitle 晚到时就绪后挂载监听与提示词', () => {
  const { ctx, injections, infos } = applyFixture()
  apply(ctx)

  assert.ok(injections.has('systemPrompt'))
  assert.ok(injections.has('sessionTitle'))

  const registrations = { sections: [], contexts: [] }
  injections.get('systemPrompt')(promptChild(registrations))
  assert.equal(registrations.sections.length, 0)
  assert.equal(registrations.contexts.length, 1)
  assert.equal(registrations.contexts[0].name, 'dsh-workflow-shortcuts-user-action')
  assert.equal(registrations.contexts[0].order, 130)
  assert.equal(registrations.contexts[0].required, true)
  assert.equal(registrations.contexts[0].interpolate, false)

  const events = []
  const titleCtx = {
    logger: { info: (message) => infos.push(message) },
    on: (event, handler, options) => events.push({ event, handler, options })
  }
  injections.get('sessionTitle')(titleCtx)
  assert.equal(events.length, 1)
  assert.equal(events[0].event, 'session/event')
  assert.deepEqual(events[0].options, { global: true })
  assert.ok(infos.some((message) => String(message).includes('TODO 标题监听已挂载')))
})

test('Host：晚挂载的 session/event 监听仍能改名标题', async () => {
  const { ctx, injections } = applyFixture()
  apply(ctx)

  const calls = []
  const session = { id: 'mounted', header: { cwd: '/tmp/ws', delegationDepth: 0 }, meta: {} }
  let current = '晚挂载'
  const titleCtx = {
    logger: { info() {} },
    get: (name) => name === 'sessionTitle' ? {
      get: (value) => ({ title: value === session ? current : '' }),
      rename: async (value, title) => { calls.push(title); current = title }
    } : undefined,
    on: (event, handler) => {
      if (event === 'session/event') handler(session, todoMessage(`请确认\n${USER_ACTION_MARKER}`))
    }
  }
  injections.get('sessionTitle')(titleCtx)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['TODO：晚挂载'])
})

test('Host：监听回调在 append 发布期间只排队，发布结束后才改名', async () => {
  const calls = []
  let current = '修复登录'
  const session = { id: 'deferred', header: { cwd: '/tmp/ws', delegationDepth: 0 }, meta: {} }
  const ctx = {
    logger: { warn() {} },
    get: (name) => name === 'sessionTitle' ? {
      get: (value) => ({ title: value === session ? current : '' }),
      rename: async (value, title) => { calls.push(title); current = title }
    } : undefined
  }
  scheduleAssistantMessage(ctx, {}, session, todoMessage(`请确认\n${USER_ACTION_MARKER}`))
  // 模拟 Session.commit()：回调同步阶段仍处于 append 发布中，此时不能改名。
  assert.deepEqual(calls, [])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['TODO：修复登录'])
})

test('Host：命中标记但 sessionTitle 不可用告警一次并返回 false', async () => {
  const { ctx, session, warnings } = todoFixture({ id: 'no-service', noTitleService: true })
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), false)
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), false)
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0][0]), /sessionTitle 不可用/)
  assert.equal(warnings[0][1], 'no-service')
})

test('Host：命中标记但标题为空告警并返回 false', async () => {
  const { ctx, session, calls, warnings } = todoFixture({ id: 'empty-title', title: '' })
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), false)
  assert.deepEqual(calls, [])
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0][0]), /标题为空/)
  assert.equal(warnings[0][1], 'empty-title')
})

test('Host：旧 HTML 注释标记仍能触发标题改名', async () => {
  const { ctx, session, calls } = todoFixture({ id: 'legacy-marker' })
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage('请确认\n<!-- dsh:user-action -->')), true)
  assert.deepEqual(calls, ['TODO：修复登录'])
})

test('Host：提示词包含压制旧标记的约束且不复述完整旧标记', () => {
  const { ctx, injections } = applyFixture()
  apply(ctx)
  const registrations = { sections: [], contexts: [] }
  injections.get('systemPrompt')(promptChild(registrations))
  const text = registrations.contexts[0].text()
  assert.ok(text.includes('历史消息'))
  assert.ok(text.includes('禁止模仿'))
  assert.ok(text.includes('只使用本节给出的不可见字符'))
  assert.ok(!text.includes('<!--'))
  assert.ok(!text.includes('dsh:user-action'))
})

test('Host：末尾隐藏标记触发 TODO 标题且已带前缀时不重复', async () => {
  const { ctx, session, calls } = todoFixture()
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), true)
  assert.deepEqual(calls, ['TODO：修复登录'])
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage(`再次确认\n${USER_ACTION_MARKER}`)), false)
  assert.deepEqual(calls, ['TODO：修复登录'])
})

test('Host：标记在中间、代码块或 reasoning 中不触发', async () => {
  const { ctx, session, calls } = todoFixture({ id: 'mid-marker' })
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage('正文提及 <!-- dsh:user-action --> 但在中间')), false)
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage('```html\n<!-- dsh:user-action -->\n```')), false)
  assert.equal(await onAssistantMessage(ctx, {}, session, {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'reasoning', text: '<!-- dsh:user-action -->' }] } }
  }), false)
  assert.deepEqual(calls, [])
})

test('Host：主会话 delegationDepth 0 可触发，subagent 不触发', async () => {
  const main = todoFixture({ id: 'main-depth-0', delegationDepth: 0 })
  assert.equal(await onAssistantMessage(main.ctx, {}, main.session, todoMessage(`需要确认\n${USER_ACTION_MARKER}`)), true)
  assert.deepEqual(main.calls, ['TODO：修复登录'])

  const sub = todoFixture({ id: 'sub-depth-1', delegationDepth: 1 })
  assert.equal(await onAssistantMessage(sub.ctx, {}, sub.session, todoMessage(`需要确认\n${USER_ACTION_MARKER}`)), false)
  assert.deepEqual(sub.calls, [])

  const origin = todoFixture({ id: 'sub-origin', origin: 'subagent' })
  assert.equal(await onAssistantMessage(origin.ctx, {}, origin.session, todoMessage(`需要确认\n${USER_ACTION_MARKER}`)), false)
  assert.deepEqual(origin.calls, [])
})

test('Host：D/G 命令会话的 TODO 前缀保留命令标识', async () => {
  const d = todoFixture({ id: 'd-session', title: 'D: 实现登录' })
  assert.equal(await onAssistantMessage(d.ctx, {}, d.session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), true)
  assert.deepEqual(d.calls, ['TODO D: 实现登录'])

  const g = todoFixture({ id: 'g-session', title: 'G：修复登录' })
  assert.equal(await onAssistantMessage(g.ctx, {}, g.session, todoMessage(`请确认\n${USER_ACTION_MARKER}`)), true)
  assert.deepEqual(g.calls, ['TODO G：修复登录'])
})

test('Host：模型漏输出标记但收尾含实质「需要你执行」小节时兜底改名', async () => {
  const { ctx, session, calls } = todoFixture({ id: 'section-fallback' })
  assert.equal(await onAssistantMessage(ctx, {}, session, todoMessage('## 需要你执行\n\n1. 重启 dsh-web\n\n```bash\nsystemctl --user restart dsh-web.service\n```')), true)
  assert.deepEqual(calls, ['TODO：修复登录'])

  // 只写「无」不兜底；subagent 会话不兜底。
  const idle = todoFixture({ id: 'section-none' })
  assert.equal(await onAssistantMessage(idle.ctx, {}, idle.session, todoMessage('## 需要你执行\n\n无')), false)
  assert.deepEqual(idle.calls, [])
  const sub = todoFixture({ id: 'section-sub', delegationDepth: 1 })
  assert.equal(await onAssistantMessage(sub.ctx, {}, sub.session, todoMessage('## 需要你执行\n\n1. 重启 dsh-web')), false)
  assert.deepEqual(sub.calls, [])
})
