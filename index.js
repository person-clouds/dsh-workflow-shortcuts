/**
 * DSH 工作流快捷命令（Host 侧）。
 *
 * /D、/G 的输入识别与动作都在 Client 侧完成。Host 只声明可选配置，
 * 并把清洗后的规范文档路径与提示词附加要求文件路径注入浏览器全局，
 * 供 Client 在每次 /D、/G 提交时读取。
 */

import z from '@deepseek-ai/schemastery'

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

export function apply(ctx, config = {}) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: CONFIG_GLOBAL,
      value: normalizeConfig(config),
    })
  })
}
