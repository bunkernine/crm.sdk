import type { CRMConfig, HookName, HookPayload } from './types'

export async function runHook(
  config: CRMConfig,
  hookName: HookName,
  data: HookPayload,
): Promise<boolean> {
  const hook = config.hooks[hookName]
  if (!hook) {
    return true
  }
  return hook(data)
}
