/** 读取并解析随插件打包的 SKILL.md，供 Host 启动时注册。 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL_NAMES = ['change-verify', 'plan-verify']
export const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

/** 解析带 YAML frontmatter 的 SKILL.md；不合法时返回 null。 */
export function parseSkillDocument(text, path = '') {
  const normalized = String(text).replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(normalized)
  if (match === null) return null

  const fields = {}
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(line.trim())
    if (pair !== null) fields[pair[1]] = pair[2].trim().replace(/^['"]|['"]$/gu, '')
  }
  if (!fields.name || !fields.description) return null

  return {
    name: fields.name,
    description: fields.description,
    whenToUse: fields.whenToUse ?? '',
    content: match[2].trim(),
    path,
  }
}

/** 读取全部内置技能；单个文件缺失或格式错误时跳过，不阻塞插件加载。 */
export function loadBundledSkills(dir = SKILLS_DIR) {
  const skills = []
  for (const name of SKILL_NAMES) {
    const path = join(dir, name, 'SKILL.md')
    try {
      const parsed = parseSkillDocument(readFileSync(path, 'utf8'), path)
      if (parsed !== null && parsed.name === name) skills.push(parsed)
    } catch {
      // 技能缺失只影响对应命令的提示，不影响 /D、/G、/V。
    }
  }
  return skills
}
