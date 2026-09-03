import { registerClaudeIpc } from './claude'
import { registerDoctorIpc } from './doctor'
import { registerFsIpc } from './fs'
import { registerGitIpc } from './git'
import { registerStateIpc } from './state'
import { registerTerminalIpc } from './terminal'
import { registerWorkspaceIpc } from './workspace'

export function registerIpc(): void {
  registerStateIpc()
  registerWorkspaceIpc()
  registerTerminalIpc()
  registerClaudeIpc()
  registerFsIpc()
  registerGitIpc()
  registerDoctorIpc()
}
