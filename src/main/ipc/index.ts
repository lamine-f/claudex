import { registerClaudeIpc } from './claude'
import { registerDoctorIpc } from './doctor'
import { registerStateIpc } from './state'
import { registerTerminalIpc } from './terminal'
import { registerWorkspaceIpc } from './workspace'

export function registerIpc(): void {
  registerStateIpc()
  registerWorkspaceIpc()
  registerTerminalIpc()
  registerClaudeIpc()
  registerDoctorIpc()
}
