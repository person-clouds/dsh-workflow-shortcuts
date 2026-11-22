/** TODO 用户动作标记与标题前缀工具。 */

/** 消息末尾的不可见标记：两个 U+2063 INVISIBLE SEPARATOR。 */
export const USER_ACTION_MARKER = '\u2063\u2063'
const MARKER = /(?:\u2063+|<!--\s*dsh:user-action\s*-->)\s*$/u
const PREFIX = /^TODO(?:[：:]\s*|\s+(?=[DG][：:]))/u
const COMMAND_PREFIX = /^[DG][：:]/u

/** 消息末尾是否有隐藏的用户动作标记。 */
export function hasUserActionMarker(text) {
  return typeof text === 'string' && MARKER.test(text.trimEnd())
}

/** 「需要你执行」小节标题：Markdown 标题、加粗行或独占一行的标签。 */
const ACTION_HEADING = /^ {0,3}(?:#{1,6}[ \t]*|\*\*[ \t]*)?需要你执行[ \t]*[:：]?[ \t]*(?:\*\*)?[ \t]*$/u
/** 任意 Markdown 标题行，用于结束上一个「需要你执行」小节。 */
const NEXT_HEADING = /^ {0,3}#{1,6}[ \t]+\S/u
const CODE_FENCE = /^ {0,3}(?:```|~~~)/u
const LIST_ITEM = /^ {0,3}(?:\d+[.)、]|[-*+])\s+\S/u

/**
 * 最后一条消息是否含实质「需要你执行」小节。
 *
 * 兜底模型漏输出不可见标记：小节内有代码块或列表条目才算需要用户动作；
 * 只写「无」或纯说明文字不算。只看最后一段，避免引用旧小节误判。
 */
export function hasUserActionSection(text) {
  if (typeof text !== 'string' || !text.includes('需要你执行')) return false
  const sections = []
  let section
  let inFence = false
  for (const line of text.split('\n')) {
    if (CODE_FENCE.test(line)) {
      inFence = !inFence
      if (section) section.code = true
      continue
    }
    if (inFence) continue
    if (ACTION_HEADING.test(line)) {
      if (section) sections.push(section)
      section = { code: false, list: false }
      continue
    }
    if (NEXT_HEADING.test(line)) {
      if (section) sections.push(section)
      section = undefined
      continue
    }
    if (section && LIST_ITEM.test(line)) section.list = true
  }
  if (section) sections.push(section)
  const last = sections[sections.length - 1]
  return Boolean(last && (last.code || last.list))
}

/** 内部 subagent 会话不参与 TODO 标记；delegationDepth 0 是主会话。 */
export function isSubagentMeta(meta) {
  const value = meta && typeof meta === 'object' ? meta : {}
  const depth = Number(value.delegationDepth)
  return value.origin === 'subagent' || value.parentSession !== undefined || (Number.isFinite(depth) && depth > 0)
}

/** 标题是否已带 TODO 前缀。 */
export function hasTodoPrefix(title) {
  return PREFIX.test(String(title ?? ''))
}

/** 给标题加 TODO 前缀；空标题回退，已带前缀时保持幂等。 */
export function withTodoPrefix(title) {
  const value = String(title ?? '').trim() || '未命名会话'
  if (hasTodoPrefix(value)) return value
  return COMMAND_PREFIX.test(value) ? `TODO ${value}` : `TODO：${value}`
}

/** 只去掉开头一个 TODO 前缀，其他内容保持不变。 */
export function stripTodoPrefix(title) {
  return String(title ?? '').replace(PREFIX, '')
}
