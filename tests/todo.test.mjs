import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  hasTodoPrefix,
  hasUserActionMarker,
  hasUserActionSection,
  isSubagentMeta,
  stripTodoPrefix,
  USER_ACTION_MARKER,
  withTodoPrefix,
} from '../lib/todo.js'

test('不可见标记只在消息末尾生效，旧 HTML 注释式标记仍可识别', () => {
  assert.equal(hasUserActionMarker(`请确认\n${USER_ACTION_MARKER}`), true)
  assert.equal(hasUserActionMarker('请确认\n\u2063'), true)
  assert.equal(hasUserActionMarker(`请确认\n${USER_ACTION_MARKER}\n`), true)
  assert.equal(hasUserActionMarker(`正文提及 ${USER_ACTION_MARKER} 但在中间`), false)
  assert.equal(hasUserActionMarker('请确认\n<!-- dsh:user-action -->'), true)
  assert.equal(hasUserActionMarker('正文提及 <!-- dsh:user-action --> 但在中间'), false)
  assert.equal(hasUserActionMarker('```html\n<!-- dsh:user-action -->\n```'), false)
})

test('subagent 会话不参与 TODO 标记，delegationDepth 0 是主会话', () => {
  assert.equal(isSubagentMeta({ delegationDepth: 0 }), false)
  assert.equal(isSubagentMeta({ delegationDepth: 1 }), true)
  assert.equal(isSubagentMeta({ origin: 'subagent' }), true)
  assert.equal(isSubagentMeta({ parentSession: 'parent' }), true)
})

test('TODO 前缀识别兼容全角/半角冒号与 D:/G:/C: 标题', () => {
  assert.equal(hasTodoPrefix('TODO：修复登录'), true)
  assert.equal(hasTodoPrefix('TODO: 修复登录'), true)
  assert.equal(hasTodoPrefix('TODO D: 修复登录'), true)
  assert.equal(hasTodoPrefix('TODO G：修复登录'), true)
  assert.equal(hasTodoPrefix('TODO C：查问题'), true)
  assert.equal(hasTodoPrefix('TODO C: 查问题'), true)
  assert.equal(hasTodoPrefix('TODO 修复登录'), false)
  assert.equal(hasTodoPrefix('修复登录'), false)
})

test('withTodoPrefix 幂等，并给 D:/G:/C: 标题加空格形式前缀', () => {
  assert.equal(withTodoPrefix('修复登录'), 'TODO：修复登录')
  assert.equal(withTodoPrefix('TODO：修复登录'), 'TODO：修复登录')
  assert.equal(withTodoPrefix('TODO: 修复登录'), 'TODO: 修复登录')
  assert.equal(withTodoPrefix('D: 修复登录'), 'TODO D: 修复登录')
  assert.equal(withTodoPrefix('G：修复登录'), 'TODO G：修复登录')
  assert.equal(withTodoPrefix('C: 查问题'), 'TODO C: 查问题')
  assert.equal(withTodoPrefix('C：查问题'), 'TODO C：查问题')
  assert.equal(withTodoPrefix(''), 'TODO：未命名会话')
})

test('stripTodoPrefix 只去掉一个 TODO 前缀', () => {
  assert.equal(stripTodoPrefix('TODO：修复登录'), '修复登录')
  assert.equal(stripTodoPrefix('TODO: 修复登录'), '修复登录')
  assert.equal(stripTodoPrefix('TODO D: 修复登录'), 'D: 修复登录')
  assert.equal(stripTodoPrefix('TODO G：修复登录'), 'G：修复登录')
  assert.equal(stripTodoPrefix('TODO C：查问题'), 'C：查问题')
  assert.equal(stripTodoPrefix('修复登录'), '修复登录')
})

test('兜底：模型漏输出标记时用收尾「需要你执行」小节识别用户动作', () => {
  assert.equal(hasUserActionSection('## 需要你执行\n\n1. 重启服务\n2. 硬刷新'), true)
  assert.equal(hasUserActionSection('**需要你执行**\n\n```bash\nsystemctl --user restart dsh-web.service\n```'), true)
  assert.equal(hasUserActionSection('需要你执行：\n\n- 确认是否合并'), true)
  assert.equal(hasUserActionSection('## 需要你执行\n\n无'), false)
  assert.equal(hasUserActionSection('## 需要你执行\n\n无（本轮无需你操作）'), false)
  assert.equal(hasUserActionSection('## 需要你执行\n\n请在终端确认后告诉我。'), false)
  assert.equal(hasUserActionSection('正文提到需要你执行，但没有小节'), false)
  assert.equal(hasUserActionSection('```markdown\n## 需要你执行\n\n1. 示例\n```'), false)
  assert.equal(hasUserActionSection('## 需要你执行\n\n1. 旧动作\n\n## 需要你执行\n\n无'), false)
  assert.equal(hasUserActionSection('## 需要你执行\n\n1. 重启\n\n## 下一步\n\n- 看日志'), true)
})
