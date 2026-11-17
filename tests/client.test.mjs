import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

function loadPlugin() {
  let plugin
  const icons = {
    IconPlanOutlineRegular: () => null,
    IconPlayOutlineRegular: () => null
  }
  const sandbox = {
    console,
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

function createHarness(options = {}) {
  const calls = { prompts: [], renames: [], creates: [], opened: [], reads: [] }
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
          }
        }
      })
    },
    async create(options) {
      calls.creates.push(options)
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
        return { ok: true, value: { text: options.planText ?? '' } }
      }
    }
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
  loadPlugin().apply(ctx)
  assert.ok(source, '应注册 / 输入源')
  return { source, calls }
}

test('/D：claim 后发送讨论提示词', async () => {
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
  assert.equal(calls.prompts.length, 1)
  assert.equal(calls.prompts[0].id, 's1')
  assert.match(calls.prompts[0].content[0].text, /讨论阶段/)
  assert.match(calls.prompts[0].content[0].text, /短而可执行/)
  assert.match(calls.prompts[0].content[0].text, /不要写成多层方案/)
  assert.match(calls.prompts[0].content[0].text, /实现登录/)
})

test('/G：解析相对路径并新建实施会话', async () => {
  const { source, calls } = createHarness()
  const outcome = source.matchSpace({ sessionId: 's1' }, '/G')
  assert.equal(outcome.claim.token, '/G ')
  const result = await outcome.claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(JSON.stringify(calls.creates), JSON.stringify([{ workspaceId: 'w1' }]))
  assert.equal(calls.renames[0].id, 's2')
  assert.equal(calls.renames[0].title, '实施：PLAN-foo.md')
  assert.equal(calls.prompts[0].id, 's2')
  assert.match(calls.prompts[0].content[0].text, /\/repo\/task\/foo\/PLAN-foo\.md/)
  assert.match(calls.prompts[0].content[0].text, /AGENTS\.md/)
  assert.match(calls.prompts[0].content[0].text, /路径已经验证过/)
  assert.match(calls.prompts[0].content[0].text, /方案无需讨论/)
  assert.match(calls.prompts[0].content[0].text, /无需逐项复核路径/)
  assert.match(calls.prompts[0].content[0].text, /直接按文档执行/)
  assert.doesNotMatch(calls.prompts[0].content[0].text, /完整阅读|先阅读相关代码|执行要求/)
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/G：输入文字时新建任务会话', async () => {
  const { source, calls } = createHarness()
  const outcome = source.matchEnter({ sessionId: 's1' }, '/G 修复登录失败问题', undefined, { attachments: 0 })
  assert.equal(outcome.claim.token, '/G ')
  const result = await outcome.claim.submit('修复登录失败问题', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(JSON.stringify(calls.creates), JSON.stringify([{ workspaceId: 'w1' }]))
  assert.equal(calls.renames[0].id, 's2')
  assert.equal(calls.renames[0].title, '任务：修复登录失败问题')
  assert.match(calls.prompts[0].content[0].text, /任务：/)
  assert.match(calls.prompts[0].content[0].text, /修复登录失败问题/)
  assert.doesNotMatch(calls.prompts[0].content[0].text, /计划文档：/)
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/G：计划路径 + 补充要求时新建实施会话', async () => {
  const { source, calls } = createHarness()
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit(
    'task/foo/PLAN-foo.md 只改 backend，并补充回归测试',
    {},
    []
  )
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, '实施：PLAN-foo.md')
  assert.match(calls.prompts[0].content[0].text, /\/repo\/task\/foo\/PLAN-foo\.md/)
  assert.match(calls.prompts[0].content[0].text, /只改 backend，并补充回归测试/)
})

test('/G：计划标题优先取第一个 H1', async () => {
  const { source, calls } = createHarness({ planText: '# 归档会话标题缓存\n\n## 背景\n正文\n' })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, '实施：归档会话标题缓存')
  assert.equal(calls.reads[0].id, 's1')
  assert.equal(calls.reads[0].path, '/repo/task/foo/PLAN-foo.md')
  assert.equal(JSON.stringify(calls.reads[0].range), JSON.stringify({ offset: 1, limit: 40 }))
})

test('/G：无 H1 时取第一个 H2，并忽略代码围栏内的标题', async () => {
  const { source, calls } = createHarness({
    planText: '```md\n# 代码示例里的标题\n```\n\n## 实施步骤\n1. 修改 client.js\n'
  })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, '实施：实施步骤')
})

test('/G：计划标题去掉计划前缀', async () => {
  const { source, calls } = createHarness({ planText: '# PLAN: 归档会话标题缓存\n' })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, '实施：归档会话标题缓存')
})

test('/G：读取计划失败时回退文件名', async () => {
  const { source, calls } = createHarness({ readError: new Error('文件不可读') })
  const result = await source.matchSpace({ sessionId: 's1' }, '/G').claim.submit('task/foo/PLAN-foo.md', {}, [])
  assert.equal(result.kind, 'success')
  assert.equal(calls.renames[0].title, '实施：PLAN-foo.md')
  assert.equal(JSON.stringify(calls.opened), JSON.stringify(['s2']))
})

test('/G：缺少计划路径或任务文字时返回错误', async () => {
  const { source, calls } = createHarness()
  const outcome = source.matchEnter({ sessionId: 's1' }, '/G', undefined, { attachments: 0 })
  const result = await outcome.claim.submit('', {}, [])
  assert.equal(result.kind, 'error')
  assert.match(result.text, /用法/)
  assert.equal(calls.creates.length, 0)
})
