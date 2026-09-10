import { registerClaudeIpc } from './claude'
import { registerDoctorIpc } from './doctor'
import { registerFsIpc } from './fs'
import { registerGitIpc } from './git'
import { registerServicesIpc } from './services'
import { registerStateIpc } from './state'
import { registerTachesIpc } from './taches'
import { registerTerminalIpc } from './terminal'
import { registerWorkspaceIpc } from './workspace'

export function registerIpc(): void {
  registerStateIpc()
  registerWorkspaceIpc()
  registerTerminalIpc()
  registerClaudeIpc()
  registerFsIpc()
  registerGitIpc()
  registerServicesIpc()
  registerTachesIpc()
  registerDoctorIpc()
}
