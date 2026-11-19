/**
 * DSH 工作流快捷命令（Host 侧）。
 *
 * /D、/G 的输入识别与动作都在 Client 侧完成。Host 只声明可选配置，
 * 并把清洗后的规范文档路径注入浏览器全局，供 Client 在 /D 提交时读取。
 */

import z from '@deepseek-ai/schemastery'

export const name = 'dsh-workflow-shortcuts'

/** 浏览器启动时读取的全局配置名。 */
export const CONFIG_GLOBAL = '__DSH_WORKFLOW_SHORTCUTS_CONFIG__'

export const Config = z.object({
  workflowDoc: z.string().default('').description('工作流/授权规范文档路径；留空表示不指定。'),
  planDoc: z.string().default('').description('计划文档规范路径；留空表示不指定。'),
  planTemplate: z.string().default('').description('计划模板路径；留空表示不指定。'),
})

/** 只保留非空字符串，并去掉首尾空白；缺失或非法值按未配置处理。 */
function cleanDocPath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 清洗 Host 配置；返回的对象只含三个公开字段。 */
export function normalizeConfig(config) {
  return {
    workflowDoc: cleanDocPath(config?.workflowDoc),
    planDoc: cleanDocPath(config?.planDoc),
    planTemplate: cleanDocPath(config?.planTemplate),
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
