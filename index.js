/**
 * DSH 工作流快捷命令（Host 占位）。
 *
 * /D、/G 的输入识别与动作都在 Client 侧完成，Host 这里只保留一个空插件，
 * 让 profile 的 bundle patch 能正常挂载、并为客户端脚本注册加载入口。
 */

export const name = 'dsh-workflow-shortcuts'

export function apply() {}
