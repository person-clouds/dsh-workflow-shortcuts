import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

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
  apply,
  name,
  normalizeConfig
} = await import('../index.js')

test('Host：Config 默认值', () => {
  assert.equal(name, 'dsh-workflow-shortcuts')
  assert.deepEqual(Config(), {
    workflowDoc: '',
    planDoc: '',
    planTemplate: '',
    discussionPromptFile: DEFAULT_DISCUSSION_PROMPT_FILE,
    executionPromptFile: DEFAULT_EXECUTION_PROMPT_FILE
  })
})

test('Host：normalizeConfig 只保留清洗后的五个字符串字段', () => {
  assert.deepEqual(normalizeConfig(), {
    workflowDoc: '',
    planDoc: '',
    planTemplate: '',
    discussionPromptFile: '',
    executionPromptFile: ''
  })
  assert.deepEqual(
    normalizeConfig({
      workflowDoc: ' /a.md ',
      planDoc: 42,
      planTemplate: '   ',
      discussionPromptFile: ' prompts/d.md ',
      executionPromptFile: 'none',
      extra: 'ignored'
    }),
    {
      workflowDoc: '/a.md',
      planDoc: '',
      planTemplate: '',
      discussionPromptFile: 'prompts/d.md',
      executionPromptFile: 'none'
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
      executionPromptFile: '/tmp/execution.md'
    }
  }])
})

test('Host：未配置时注入空配置，仍固定五个字段', () => {
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
      executionPromptFile: ''
    }
  })
})
