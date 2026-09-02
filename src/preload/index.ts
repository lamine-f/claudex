import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, ClaudeSession, DoctorCheck, Tab, Workspace } from '@shared/types'

/**
 * Surface exposée au renderer. Volontairement étroite : le renderer n'a jamais
 * accès à `ipcRenderer` ni à quoi que ce soit de Node, uniquement à ces méthodes.
 */
const api = {
  state: {
    get: (): Promise<AppState> => ipcRenderer.invoke('state:get'),
    setLayout: (layout: Partial<AppState['layout']>): Promise<AppState['layout']> =>
      ipcRenderer.invoke('state:setLayout', layout),
    setActiveWorkspace: (id: string | undefined): Promise<void> =>
      ipcRenderer.invoke('state:setActiveWorkspace', id)
  },
  workspace: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke('workspace:list'),
    add: (): Promise<Workspace | null> => ipcRenderer.invoke('workspace:add'),
    remove: (id: string): Promise<Workspace[]> => ipcRenderer.invoke('workspace:remove', id),
    update: (id: string, patch: Partial<Omit<Workspace, 'id'>>): Promise<Workspace[]> =>
      ipcRenderer.invoke('workspace:update', id, patch)
  },
  term: {
    list: (workspaceId: string): Promise<Tab[]> => ipcRenderer.invoke('term:list', workspaceId),
    create: (workspaceId: string, options?: Partial<Tab>): Promise<Tab> =>
      ipcRenderer.invoke('term:create', workspaceId, options ?? {}),
    open: (tabId: string, cols: number, rows: number): Promise<{ tab: Tab; reprise: boolean }> =>
      ipcRenderer.invoke('term:open', tabId, cols, rows),
    input: (tabId: string, donnees: string): void =>
      ipcRenderer.send('term:input', tabId, donnees),
    resize: (tabId: string, cols: number, rows: number): void =>
      ipcRenderer.send('term:resize', tabId, cols, rows),
    detach: (tabId: string): Promise<void> => ipcRenderer.invoke('term:detach', tabId),
    close: (tabId: string): Promise<Tab[]> => ipcRenderer.invoke('term:close', tabId),
    rename: (tabId: string, titre: string): Promise<Tab | undefined> =>
      ipcRenderer.invoke('term:rename', tabId, titre),

    /** Abonnement à la sortie d'un terminal. Renvoie la fonction de désabonnement. */
    onData: (rappel: (tabId: string, donnees: string) => void): (() => void) => {
      const ecouteur = (_e: unknown, tabId: string, donnees: string): void =>
        rappel(tabId, donnees)
      ipcRenderer.on('term:data', ecouteur)
      return () => ipcRenderer.removeListener('term:data', ecouteur)
    },
    onExit: (rappel: (tabId: string, code: number) => void): (() => void) => {
      const ecouteur = (_e: unknown, tabId: string, code: number): void => rappel(tabId, code)
      ipcRenderer.on('term:exit', ecouteur)
      return () => ipcRenderer.removeListener('term:exit', ecouteur)
    }
  },
  claude: {
    listSessions: (workspaceId: string): Promise<ClaudeSession[]> =>
      ipcRenderer.invoke('claude:listSessions', workspaceId),
    ouvrir: (
      workspaceId: string,
      intention: 'nouvelle' | 'reprise' | 'bifurcation',
      uuid?: string
    ): Promise<Tab> => ipcRenderer.invoke('claude:ouvrir', workspaceId, intention, uuid)
  },
  doctor: {
    check: (): Promise<DoctorCheck[]> => ipcRenderer.invoke('doctor:check'),
    applySettingsFix: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('doctor:applySettingsFix')
  }
}

export type ClaudexApi = typeof api

contextBridge.exposeInMainWorld('claudex', api)
