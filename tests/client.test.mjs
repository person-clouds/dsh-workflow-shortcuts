import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

function loadPlugin(globals = {}) {
  let plugin
  const icons = {
    IconPlanOutlineRegular: () => null,
    IconPlayOutlineRegular: () => null,
    IconChecklistOutlineRegular: () => null
  }
  const window = {
    __ModuleLoader__: {
      load({ factory }) {
        plugin = factory((id) => id === '@deepseek-ai/dsh-client-ui-primitives' ? icons : {})
      }
    },
    ...(globals.window ?? {})
  }
  const sandbox = {
    console,
    ...globals,
    window
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox)
  assert.ok(plugin, 'client.js 应通过 __ModuleLoader__ 注册')
  return { plugin, window }
}

function createElement(tag) {
  return {
    tagName: tag,
    children: [],
    listeners: {},
    parentNode: undefined,
    className: '',
    textContent: '',
    type: '',
    open: false,
    appendChild(child) {
      this.children.push(child)
      child.parentNode = this
      return child
    },
    addEventListener(type, handler) {
      ;(this.listeners[type] ??= []).push(handler)
    },
    remove() {
      if (!this.parentNode) return
      const index = this.parentNode.children.indexOf(this)
      if (index !== -1) this.parentNode.children.splice(index, 1)
      this.parentNode = undefined
    },
    close() {
      this.open = false
      for (const handler of this.listeners.close ?? []) handler({})
    },
    showModal() {
      this.open = true
    }
  }
}

function userMessage(text) {
  return { type: 'user/message', data: { message: { content: [{ type: 'text', text }] } } }
}

function assistantMessage(text) {
  return { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } }
}

function wrappedMessage(type, text) {
  return { type: 'event', event: { type, data: { message: { content: [{ type: 'text', text }] } } } }
}

function toolMessage(text) {
  return { type: 'tool/message', data: { message: { content: [{ type: 'text', text }] } } }
}

function createHarness(options = {}) {
  const calls = { prompts: [], renames: [], creates: [], opened: [], reads: [], dialogs: [] }
  const entries = options.entries ?? []
  const sessions = {
    subagentAddress: () => undefined,
    list: { getSnapshot: () => ({ byId: { s1: { cwd: '/repo' } } }) },
    async using(id, _options, operation) {
      return operation({
        binding: {
          session: {
            projections: {
              faceOf: (name) => ({ getSnapshot: () => name === 'title' ? (options.title ?? '') : undefined })
            },
            async rename(title) {
              calls.renames.push({ id, title })
              return { ok: true, value: { title, seq: 1 } }
            },
            async prompt(content) {
              calls.prompts.push({ id, content })
              return { ok: true, value: { accepted: true } }
            }
          },
          eventSource: {
            getSnapshot: () => ({ entries })
          }
        }
      })
    },
    async create(createOptions) {
      calls.creates.push(createOptions)
      return 's2'
    }
  }
  const workspaces = {
    list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', path: '/repo' }] }) },
    async create() {
      throw new Error('不应创建已存在的工作区')
    }
  }
  const uiWorkspace = { openSession: (id) => calls.opened.push(id) }
  const remote = {
    workspaceFiles: {
      async read(sessionId, path, range) {
        calls.reads.push({ id: sessionId, path, range })
        if (options.readError !== undefined) throw options.readError
        if (Object.hasOwn(options.files ?? {}, path)) {
          return { ok: true, value: { text: options.files[path] } }
        }
        if (path.includes('/.dsh/workflow-shortcuts/')) {
          return { ok: false, error: { code: 'ENOENT', message: 'not found' } }
        }
        if (Array.isArray(options.unreadable) && options.unreadable.includes(path)) {
          return { ok: false, error: { code: 'ENOENT', message: 'not found' } }
        }
        return { ok: true, value: { text: options.planText ?? '' } }
      }
    }
  }
  const localStorage = {
    getItem(key) {
      return Object.hasOwn(options.localStorage ?? {}, key) ? options.localStorage[key] : null
    }
  }
  const document = {
    body: {
      children: [],
      appendChild(element) {
        this.children.push(element)
        element.parentNode = this
        calls.dialogs.push(element)
        options.onDialog?.(element)
        return element
      },
      removeChild(element) {
        const index = this.children.indexOf(element)
        if (index !== -1) this.children.splice(index, 1)
      }
    },
    createElement
  }
  const sources = []
  const ctx = {
    sessions,
    workspaces,
    uiWorkspace,
    remote,
    get: () => ({
      registerSource(value) {
        sources.push(value)
        return () => {}
      }
    }),
    effect: (factory) => factory()
  }
  const { plugin, window } = loadPlugin({ localStorage, document, window: options.window })
  plugin.apply(ctx)
  // /D、/G 源与 /ok 源是两个独立输入源，测试分别取用。
  const source = sources.find((value) => value.name === 'workflow-shortcuts')
  const okSource = sources.find((value) => value.name === 'dsh-workflow-shortcuts-todo')
  assert.ok(source, '应注册 /D、/G 输入源')
  assert.ok(okSource, '应注册 /ok 输入源')
  return { source, okSource, sources, calls, window }
}

function clickPlan(dialog, index) {
  const list = dialog.children[1]
  list.children[index].listeners.click[0]()
}

function clickCancel(dialog) {
  dialog.children[2].listeners.click[0]()
}

test('/D：claim 后发送讨论提示词，未配置规范时不输出具体路径', async () => {
  const { source, calls } = createHarness()
  assert.equal(source.order, -1000)
  const rows = await source.candidates({ sessionId: 's1' }, { query: '', signal: { aborted: false } })
  assert.equal(JSON.stringify(rows.map((row) => row.name)), JSON.stringify(['D', 'G', 'V']))
  assert.equal(typeof rows[0].icon, 'function')
  assert.equal(typeof rows[1].icon, 'function')
  assert.equal(typeof rows[2].icon, 'function')
  const outcome = source.matchEnter({ sessionId: 's1' }, '/D 实现登录', undefined, { attachments: 0 })
  assert.deepEqual(outcome.claim.token, '/D ')
  const result = await outcome.claim.submit('实现登录', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames.length, 1)
  assert.equal(calls.renames[0].id, 's1')
  assert.equal(calls.renames[0].title, 'D: 实现登录')
  assert.equal(calls.prompts.length, 1)
  assert.equal(calls.prompts[0].id, 's1')
  const prompt = calls.prompts[0].content[0].text
  // 三条要点：探索类先讨论不动手、按当前规范写计划、bugfix 直接做并维护文档。
  assert.match(prompt, /^1\. 读 PROJECT_INDEX，内容探索（并非既定流程的bugfix），讨论时不要直接干$/m)
  assert.match(prompt, /^2\. 确认后按当前工作区\/仓库既有规范写 PLAN-\*\.md。$/m)
  assert.match(prompt, /^3\. 计划简短可执行；已定位的bugfix直接做并说明；维护好 README\/STATUS\/PROJECT_INDEX$/m)
  assert.equal(prompt.match(/^\d+\. /gm)?.length, 3)
  assert.doesNotMatch(prompt, /_meta\/doc\/task-workflow\.md/)
  assert.doesNotMatch(prompt, /documentation-rules\.md/)
  assert.doesNotMatch(prompt, /implementation_status|## 改动记录/)
  assert.match(prompt, /实现登录/)
})

test('/D：只配置 planDoc 时只出现计划规范', async () => {
  const { source, calls } = createHarness({
    window: {
      __DSH_WORKFLOW_SHORTCUTS_CONFIG__: {
        planDoc: '  /home/zh/www/doc/specs/documentation-rules.md  '
      }
    }
  })
  await source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('写计划', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /^2\. 确认后写 PLAN-\*\.md，遵循以下规范：$/m)
  assert.match(prompt, /^- 计划规范：\/home\/zh\/www\/doc\/specs\/documentation-rules\.md$/m)
  assert.doesNotMatch(prompt, /工作流规范：|计划模板：/)
  assert.equal(prompt.match(/^\d+\. /gm)?.length, 3)
})

test('/D：三项配置按顺序进入第 2 条，且空值与非字符串被忽略', async () => {
  const { source, calls, window } = createHarness({
    window: {
      __DSH_WORKFLOW_SHORTCUTS_CONFIG__: {
        workflowDoc: ' /home/zh/www/_meta/doc/task-workflow.md ',
        planDoc: ' /home/zh/www/doc/specs/documentation-rules.md ',
        planTemplate: ' /home/zh/www/_meta/doc/plan-template.md '
      }
    }
  })
  await source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('写计划', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /- 工作流规范：\/home\/zh\/www\/_meta\/doc\/task-workflow\.md\n- 计划规范：\/home\/zh\/www\/doc\/specs\/documentation-rules\.md\n- 计划模板：\/home\/zh\/www\/_meta\/doc\/plan-template\.md/)
  assert.equal(prompt.match(/^\d+\. /gm)?.length, 3)

  window.__DSH_WORKFLOW_SHORTCUTS_CONFIG__ = {
    workflowDoc: '   ',
    planDoc: 42,
    planTemplate: null
  }
  await source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('再看一次', {}, [])
  const updated = calls.prompts[1].content[0].text
  assert.match(updated, /^2\. 确认后按当前工作区\/仓库既有规范写 PLAN-\*\.md。$/m)
  assert.doesNotMatch(updated, /工作流规范：|计划规范：|计划模板：/)
  assert.equal(updated.match(/^\d+\. /gm)?.length, 3)
})

test('/D：空任务时使用 D: 新讨论 标题', async () => {
  const { source, calls } = createHarness()
  const result = await source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, 'D: 新讨论')
  assert.equal(calls.prompts.length, 1)
})

test('/G：计划标题清洗支持全角冒号、横线与连续分隔符', async () => {
  const cases = [
    ['PLAN：修复软链', 'G：修复软链'],
    ['PLAN — 修复软链', 'G：修复软链'],
    ['PLAN - 修复软链', 'G：修复软链'],
    ['PLAN、修复软链', 'G：修复软链'],
    ['PLAN·修复软链', 'G：修复软链'],
    ['PLAN｜修复软链', 'G：修复软链'],
    ['计划：修复软链', 'G：修复软链'],
    ['pLaN: 修复软链', 'G：修复软链'],
    ['PLAN：—、修复软链', 'G：修复软链']
  ]
  for (const [heading, expected] of cases) {
    const { source, calls } = createHarness({ planText: `# ${heading}\n` })
    await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
    assert.equal(calls.renames[0].title, expected, heading)
  }
})

test('/G：Planning 不剥离前缀，纯 PLAN 回退文件名', async () => {
  const planning = createHarness({ planText: '# Planning 修复软链\n' })
  await planning.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(planning.calls.renames[0].title, 'G：Planning 修复软链')

  const onlyPrefix = createHarness({ planText: '# PLAN\n' })
  await onlyPrefix.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(onlyPrefix.calls.renames[0].title, 'G：PLAN-foo.md')
})

test('/G：显式相对路径并新建实施会话', async () => {
  const { source, calls } = createHarness()
  const outcome = source.matchSpace({ sessionId: 's1' }, '/G')
  assert.equal(outcome.claim.token, '/G ')
  const result = await outcome.claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(JSON.stringify(calls.creates), JSON.stringify([{ workspaceId: 'w1' }]))
  assert.equal(calls.renames[0].id, 's2')
  assert.equal(calls.renames[0].title, 'G：PLAN-foo.md')
  assert.equal(calls.prompts[0].id, 's2')
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /^1\. 工作区：\/repo；先读工作区 AGENTS\.md/m)
  assert.match(prompt, /计划文档：\n\/repo\/task\/foo\/PLAN-foo\.md/)
  assert.match(prompt, /^2\. 直接按计划执行；路径已验证。$/m)
  assert.match(prompt, /^3\. 完成后按 AGENTS\.md 验证收尾。$/m)
  assert.equal(prompt.match(/^\d+\. /gm)?.length, 3)
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/G：输入文字时新建任务会话', async () => {
  const { source, calls } = createHarness()
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('修复登录失败问题', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, 'G：修复登录失败问题')
  assert.match(calls.prompts[0].content[0].text, /任务：/)
  assert.match(calls.prompts[0].content[0].text, /修复登录失败问题/)
  assert.doesNotMatch(calls.prompts[0].content[0].text, /计划文档：/)
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/G：计划标题优先取第一个 H1，读取失败时回退文件名', async () => {
  const { source, calls } = createHarness({ planText: '# 归档会话标题缓存\n\n## 背景\n正文\n' })
  await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(calls.renames[0].title, 'G：归档会话标题缓存')
  assert.equal(calls.reads[0].id, 's1')
  assert.equal(calls.reads[0].path, '/repo/task/foo/PLAN-foo.md')
  assert.equal(JSON.stringify(calls.reads[0].range), JSON.stringify({ offset: 1, limit: 40 }))

  const fallback = createHarness({ readError: new Error('文件不可读') })
  await fallback.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(fallback.calls.renames[0].title, 'G：PLAN-foo.md')
})

test('/G 空参数：默认读取最近 5 条消息并命中唯一计划', async () => {
  const { source, calls } = createHarness({
    entries: [
      userMessage('旧消息'),
      userMessage('再看 task/foo/PLAN-foo.md'),
      assistantMessage('收到'),
      userMessage('没有路径'),
      assistantMessage('准备执行')
    ],
    planText: '# 空参数最近计划\n'
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.dialogs.length, 0)
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.renames[0].title, 'G：空参数最近计划')
  assert.equal(calls.reads[0].range.limit, 1)
  assert.equal(calls.reads[0].path, '/repo/task/foo/PLAN-foo.md')
})

test('/G 空参数：localStorage 自定义条数生效', async () => {
  const entries = [
    userMessage('看 /repo/task/a/PLAN-a.md'),
    userMessage('无关 1'),
    userMessage('无关 2'),
    userMessage('无关 3'),
    userMessage('无关 4'),
    userMessage('无关 5')
  ]
  const { source, calls } = createHarness({
    entries,
    localStorage: { 'dsh-workflow-shortcuts.recentMessages': '6' }
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.creates.length, 1)
})

test('/G 空参数：非法配置回退默认 5 条，并且只读取上限内的消息', async () => {
  const entries = [
    userMessage('看 /repo/task/a/PLAN-a.md'),
    userMessage('无关 1'),
    userMessage('无关 2'),
    userMessage('无关 3'),
    userMessage('无关 4'),
    userMessage('无关 5')
  ]
  const { source, calls } = createHarness({
    entries,
    localStorage: { 'dsh-workflow-shortcuts.recentMessages': 'abc' }
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'error')
  assert.match(result.text, /最近 5 条消息未找到可读的 \.md 计划文档/)
  assert.equal(calls.creates.length, 0)
})

test('/G 空参数：Markdown 链接可识别并执行', async () => {
  const { source, calls } = createHarness({
    entries: [assistantMessage('计划已生成：[PLAN-b](/repo/task/b/PLAN-b.md)')]
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.match(calls.prompts[0].content[0].text, /\/repo\/task\/b\/PLAN-b\.md/)
})

test('/G 空参数：多个候选只弹一次选择框，选中后执行对应路径', async () => {
  const { source, calls } = createHarness({
    entries: [
      userMessage('看 /repo/task/a/PLAN-a.md'),
      assistantMessage('也可以看 [PLAN-b](/repo/task/b/PLAN-b.md)')
    ],
    onDialog(dialog) {
      assert.equal(calls.dialogs.length, 1)
      clickPlan(dialog, 0)
    }
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.dialogs.length, 1)
  assert.equal(calls.creates.length, 1)
  assert.match(calls.prompts[0].content[0].text, /\/repo\/task\/b\/PLAN-b\.md/)
})

test('/G 空参数：取消选择不创建会话', async () => {
  const { source, calls } = createHarness({
    entries: [
      userMessage('看 /repo/task/a/PLAN-a.md'),
      userMessage('看 /repo/task/b/PLAN-b.md')
    ],
    onDialog: clickCancel
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.dialogs.length, 1)
  assert.equal(calls.creates.length, 0)
  assert.equal(calls.opened.length, 0)
})

test('/G 空参数：未命中或文件不可读均不创建会话', async () => {
  const missing = createHarness({ entries: [userMessage('这里没有计划')] })
  const missingResult = await missing.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(missingResult.kind, 'error')
  assert.match(missingResult.text, /未找到可读的 \.md 计划文档/)
  assert.equal(missing.calls.reads.length, 0)
  assert.equal(missing.calls.creates.length, 0)

  const unreadable = createHarness({
    entries: [userMessage('看 /repo/task/a/PLAN-a.md')],
    unreadable: ['/repo/task/a/PLAN-a.md']
  })
  const unreadableResult = await unreadable.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(unreadableResult.kind, 'error')
  assert.equal(unreadable.calls.creates.length, 0)
})

test('/G 空参数：排除 tool/system/developer 消息，按最近 N 条截断', async () => {
  const excluded = createHarness({
    entries: [
      { type: 'system/message', data: { message: { content: [{ type: 'text', text: '看 /repo/task/a/PLAN-a.md' }] } } },
      toolMessage('看 /repo/task/b/PLAN-b.md'),
      userMessage('普通消息')
    ]
  })
  const excludedResult = await excluded.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(excludedResult.kind, 'error')
  assert.equal(excluded.calls.creates.length, 0)

  const limited = createHarness({
    entries: [
      userMessage('看 /repo/task/a/PLAN-a.md'),
      userMessage('无关 1'),
      userMessage('无关 2')
    ],
    localStorage: { 'dsh-workflow-shortcuts.recentMessages': '2' }
  })
  const limitedResult = await limited.source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(limitedResult.kind, 'error')
  assert.match(limitedResult.text, /最近 2 条消息/)
})

test('/G：只接受 .md，拒绝 http(s) 与 .markdown', async () => {
  const http = createHarness()
  const httpResult = await http.source.matchEnter({ sessionId: 's1' }, '/G', undefined, { attachments: 0 })
    .claim.submit('https://example.com/PLAN-a.md', {}, [])
  assert.equal(httpResult.kind, 'success')
  assert.equal(http.calls.creates.length, 1)
  assert.match(http.calls.prompts[0].content[0].text, /任务：/)

  const markdown = createHarness()
  const markdownResult = await markdown.source.matchSpace({ sessionId: 's1' }, '/G')
    .claim.submit('task/foo/PLAN-foo.markdown', {}, [])
  assert.equal(markdownResult.kind, 'success')
  assert.match(markdown.calls.prompts[0].content[0].text, /任务：/)
})

test('/G 空参数：真实事件包装形态解析工作区相对路径', async () => {
  const { source, calls } = createHarness({
    entries: [
      userMessage('旧消息'),
      wrappedMessage('assistant/message', '计划已生成：[PLAN-doc-audience-all-repos.md](PLAN-doc-audience-all-repos.md)')
    ],
    planText: '# 文档受众统一\n'
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.dialogs.length, 0)
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.reads[0].id, 's1')
  assert.equal(calls.reads[0].path, '/repo/PLAN-doc-audience-all-repos.md')
  assert.equal(calls.renames[0].title, 'G：文档受众统一')
  assert.match(calls.prompts[0].content[0].text, /计划文档：\n\/repo\/PLAN-doc-audience-all-repos\.md/)
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/D：默认读取工作区附加要求文件并追加到任务之前', async () => {
  const overlay = '新想法先记到 doc/ideas.md；改代码前先说清影响面。'
  const { source, calls } = createHarness({
    files: { '/repo/.dsh/workflow-shortcuts/discussion.md': overlay }
  })
  await source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('记录新想法', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.equal(calls.reads[0].id, 's1')
  assert.equal(calls.reads[0].path, '/repo/.dsh/workflow-shortcuts/discussion.md')
  assert.equal(calls.reads[0].range.limit, 200)
  assert.match(prompt, /^附加要求：$/m)
  assert.match(prompt, /新想法先记到 doc\/ideas\.md；改代码前先说清影响面。/)
  assert.ok(prompt.indexOf('附加要求：') < prompt.indexOf('任务：'))
  assert.equal(prompt.match(/^\d+\. /gm)?.length, 3)
})

test('/D：缺少附加要求文件或内容为空时不出现附加段落', async () => {
  const missing = createHarness()
  await missing.source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('正常讨论', {}, [])
  assert.doesNotMatch(missing.calls.prompts[0].content[0].text, /附加要求：/)

  const blank = createHarness({
    files: { '/repo/.dsh/workflow-shortcuts/discussion.md': '  \n\n  ' }
  })
  await blank.source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('空白要求', {}, [])
  assert.doesNotMatch(blank.calls.prompts[0].content[0].text, /附加要求：/)
})

test('/D：自定义相对路径生效，none 关闭且不读文件', async () => {
  const custom = createHarness({
    window: {
      __DSH_WORKFLOW_SHORTCUTS_CONFIG__: { discussionPromptFile: ' prompts/d.md ' }
    },
    files: {
      '/repo/prompts/d.md': '自定义讨论要求',
      '/repo/.dsh/workflow-shortcuts/discussion.md': '默认文件不应被读取'
    }
  })
  await custom.source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('自定义', {}, [])
  assert.equal(custom.calls.reads[0].path, '/repo/prompts/d.md')
  assert.match(custom.calls.prompts[0].content[0].text, /自定义讨论要求/)
  assert.doesNotMatch(custom.calls.prompts[0].content[0].text, /默认文件不应被读取/)

  const disabled = createHarness({
    window: {
      __DSH_WORKFLOW_SHORTCUTS_CONFIG__: { discussionPromptFile: 'NONE' }
    },
    files: { '/repo/.dsh/workflow-shortcuts/discussion.md': '不应出现' }
  })
  await disabled.source.matchSpace({ sessionId: 's1' }, '/D').claim.submit('关闭', {}, [])
  assert.equal(disabled.calls.reads.length, 0)
  assert.doesNotMatch(disabled.calls.prompts[0].content[0].text, /不应出现|附加要求：/)
})

test('/G：执行提示词追加 execution 附加要求，且与 /D 文件互不影响', async () => {
  const { source, calls } = createHarness({
    files: {
      '/repo/.dsh/workflow-shortcuts/execution.md': '执行前先跑 npm test。',
      '/repo/.dsh/workflow-shortcuts/discussion.md': '讨论文件不应出现。'
    }
  })
  await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('修复登录问题', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /^附加要求：$/m)
  assert.match(prompt, /执行前先跑 npm test。/)
  assert.doesNotMatch(prompt, /讨论文件不应出现。/)
  assert.ok(prompt.indexOf('附加要求：') > prompt.indexOf('3. 完成后'))
})

test('/G：计划模式同样追加执行附加要求，超长内容截断', async () => {
  const { source, calls } = createHarness({
    planText: '# 登录改造\n',
    files: {
      '/repo/.dsh/workflow-shortcuts/execution.md': '甲'.repeat(9000)
    }
  })
  await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/PLAN-login.md', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /计划文档：\n\/repo\/task\/PLAN-login\.md/)
  assert.match(prompt, /附加要求：\n甲+/)
  assert.match(prompt, /已截断，超过 8000 字符/)
  assert.ok(prompt.length < 9000)
})

test('/ok：清除标题的 TODO 前缀且不归档会话', async () => {
  const { okSource, calls } = createHarness({ title: 'TODO：修复登录' })
  const outcome = await okSource.matchEnter({ sessionId: 's1' }, '/ok', undefined, { attachments: 0 })
  const result = await outcome.claim.submit()
  assert.equal(result.kind, 'success')
  assert.equal(result.text, '已清除 TODO，不归档会话')
  assert.deepEqual(calls.renames, [{ id: 's1', title: '修复登录' }])
  assert.equal(calls.prompts.length, 0)
  assert.equal(calls.creates.length, 0)
})

test('/ok：无 TODO 标记时不改名', async () => {
  const { okSource, calls } = createHarness({ title: '修复登录' })
  const outcome = okSource.matchSpace({ sessionId: 's1' }, '/ok')
  const result = await outcome.claim.submit()
  assert.equal(result.kind, 'success')
  assert.equal(result.text, '当前没有 TODO 标记，不归档会话')
  assert.equal(calls.renames.length, 0)
})

test('/ok：只匹配 /ok，不影响 /D、/G', async () => {
  const { okSource } = createHarness()
  assert.equal(okSource.order, 30)
  assert.equal(okSource.matchSpace({ sessionId: 's1' }, '/D'), undefined)
  assert.equal(await okSource.matchEnter({ sessionId: 's1' }, '/G 任务'), undefined)
  const rows = await okSource.candidates()
  assert.equal(JSON.stringify(rows.map((row) => row.label)), JSON.stringify(['/ok']))
})

test('/ok：TODO D: 前缀同样可清', async () => {
  const { okSource, calls } = createHarness({ title: 'TODO D: 写计划' })
  const claim = (await okSource.matchEnter({ sessionId: 's1' }, '/ok', undefined, { attachments: 0 })).claim
  await claim.submit()
  assert.equal(calls.renames[0].title, 'D: 写计划')
})

test('/V：新建只读核验会话，标题带 V：前缀并注入快照与两轮封顶', async () => {
  const { source, calls } = createHarness()
  assert.equal(JSON.stringify(source.lexicon({ sessionId: 's1' })), JSON.stringify(['D', 'G', 'V']))
  const outcome = source.matchEnter({ sessionId: 's1' }, '/V 核验 guard 改动', undefined, { attachments: 0 })
  assert.equal(outcome.claim.token, '/V ')
  assert.equal(outcome.claim.hint, '[改动说明 | 快照 sha]')
  const result = await outcome.claim.submit('核验 guard 改动 快照：abc1234', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.creates.length, 1)
  assert.equal(calls.renames[0].id, 's2')
  assert.equal(calls.renames[0].title, 'V：核验 guard 改动')
  assert.deepEqual(calls.opened, ['s2'])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /只读核验会话/)
  assert.match(prompt, /^快照：abc1234$/m)
  assert.match(prompt, /最多两轮/)
  assert.match(prompt, /只报告，不改代码/)
  assert.match(prompt, /需要你执行/)
  assert.doesNotMatch(prompt, /最多 25 次|25 次|40 次/)
})

test('/V：空参数使用「核验改动」标题，附件直接报错', async () => {
  const { source, calls } = createHarness()
  const empty = await source.matchSpace({ sessionId: 's1' }, '/V').claim.submit('   ', {}, [])
  assert.equal(empty.kind, 'success')
  assert.equal(calls.renames[0].title, 'V：核验改动')
  const withAttachment = await source.matchSpace({ sessionId: 's1' }, '/V').claim.submit('看下', {}, [{ name: 'a.txt' }])
  assert.equal(withAttachment.kind, 'error')
  assert.match(withAttachment.text, /不支持附件/)
})

test('/V：配置 verifyPromptFile 时把附加要求拼进提示词', async () => {
  const { source, calls } = createHarness({
    window: {
      __DSH_WORKFLOW_SHORTCUTS_CONFIG__: { verifyPromptFile: 'prompts/verify.md' }
    },
    files: { '/repo/prompts/verify.md': '附加：只看 lib/verify-mode.js' }
  })
  await source.matchSpace({ sessionId: 's1' }, '/V').claim.submit('核验预算', {}, [])
  const prompt = calls.prompts[0].content[0].text
  assert.match(prompt, /附加要求：/)
  assert.match(prompt, /只看 lib\/verify-mode\.js/)
})
