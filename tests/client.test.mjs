import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

function loadPlugin(globals = {}) {
  let plugin
  const icons = {
    IconPlanOutlineRegular: () => null,
    IconPlayOutlineRegular: () => null
  }
  const sandbox = {
    console,
    ...globals,
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          plugin = factory((id) => id === '@deepseek-ai/dsh-client-ui-primitives' ? icons : {})
        }
      }
    }
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox)
  assert.ok(plugin, 'client.js 应通过 __ModuleLoader__ 注册')
  return plugin
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
  let source
  const ctx = {
    sessions,
    workspaces,
    uiWorkspace,
    remote,
    get: () => ({
      registerSource(value) {
        source = value
        return () => {}
      }
    }),
    effect: (factory) => factory()
  }
  loadPlugin({ localStorage, document }).apply(ctx)
  assert.ok(source, '应注册 / 输入源')
  return { source, calls }
}

function clickPlan(dialog, index) {
  const list = dialog.children[1]
  list.children[index].listeners.click[0]()
}

function clickCancel(dialog) {
  dialog.children[2].listeners.click[0]()
}

test('/D：claim 后发送讨论提示词，并要求工作区相对路径 Markdown 链接', async () => {
  const { source, calls } = createHarness()
  assert.equal(source.order, -1000)
  const rows = await source.candidates({ sessionId: 's1' }, { query: '', signal: { aborted: false } })
  assert.equal(JSON.stringify(rows.map((row) => row.name)), JSON.stringify(['D', 'G']))
  assert.equal(typeof rows[0].icon, 'function')
  assert.equal(typeof rows[1].icon, 'function')
  const outcome = source.matchEnter({ sessionId: 's1' }, '/D 实现登录', undefined, { attachments: 0 })
  assert.deepEqual(outcome.claim.token, '/D ')
  const result = await outcome.claim.submit('实现登录', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames.length, 1)
  assert.equal(calls.renames[0].id, 's1')
  assert.equal(calls.renames[0].title, 'D: 实现登录')
  assert.equal(calls.prompts.length, 1)
  assert.equal(calls.prompts[0].id, 's1')
  assert.match(calls.prompts[0].content[0].text, /讨论阶段/)
  assert.match(calls.prompts[0].content[0].text, /短而可执行/)
  assert.match(calls.prompts[0].content[0].text, /不要写成多层方案/)
  assert.match(calls.prompts[0].content[0].text, /简单且改动位置明确/)
  assert.match(calls.prompts[0].content[0].text, /可以直接顺手完成/)
  assert.match(calls.prompts[0].content[0].text, /同步 README、STATUS、PROJECT_INDEX/)
  assert.match(calls.prompts[0].content[0].text, /首个 H1 固定为/)
  assert.match(calls.prompts[0].content[0].text, /# PLAN：<简短标题>/)
  assert.match(calls.prompts[0].content[0].text, /显示名用相对当前目录的半路径/)
  assert.match(calls.prompts[0].content[0].text, /链接地址用绝对全路径/)
  assert.match(calls.prompts[0].content[0].text, /\[personalCloud\/task\/foo\/PLAN-foo\.md\]\(\/home\/zh\/www\/personalCloud\/task\/foo\/PLAN-foo\.md\)/)
  assert.match(calls.prompts[0].content[0].text, /实现登录/)
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
  assert.match(calls.prompts[0].content[0].text, /\/repo\/task\/foo\/PLAN-foo\.md/)
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
