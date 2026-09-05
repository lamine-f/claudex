import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { dernierRegarde } from '@shared/onglets'
import type { Tab } from '@shared/types'
import { tmuxSessionName } from '../util/paths'
import { multiplexeur } from '../services/multiplexeur'
import * as pty from '../services/pty'
import * as scrollback from '../services/scrollback'
import * as store from '../services/store'

interface OuvertureResultat {
  tab: Tab
  /** Vrai si la session tmux préexistait : l'app avait été fermée sans reboot. */
  reprise: boolean
  /**
   * Vrai quand la session a dû être recréée et que l'écran d'avant a été restitué :
   * il y a alors quelque chose à reprendre.
   */
  aRestaurer?: boolean
}

function trouverTab(tabId: string): Tab | undefined {
  return store.get().tabs.find((t) => t.id === tabId)
}

/**
 * Créations de session en cours, indexées par onglet.
 *
 * Le renderer demande légitimement plusieurs fois l'ouverture d'un même onglet —
 * remontage React, rechargement de la page — et deux créations simultanées de la
 * même session tmux se marcheraient dessus. Seule la **création** est mutualisée :
 * l'attachement, lui, doit être refait à chaque appel, car c'est l'arrivée d'un
 * client qui pousse tmux à redessiner. Le mutualiser laisserait le nouveau xterm
 * définitivement vide.
 */
const creationsEnCours = new Map<string, Promise<{ preexistante: boolean }>>()

function assurerSession(
  tabId: string,
  tab: Tab,
  cols: number,
  rows: number,
  ecranPrecedent?: string
): Promise<{ preexistante: boolean }> {
  const enCours = creationsEnCours.get(tabId)
  if (enCours) return enCours

  // Comment l'écran d'avant est restitué et comment la commande est jouée
  // regarde le pilote : l'un passe par une ligne de shell, l'autre par un script.
  const creation = multiplexeur
    .assurer(tab.tmuxSession, tab.cwd, cols, rows, {
      commande: tab.commandeInitiale,
      ecranPrecedent
    })
    .finally(() => creationsEnCours.delete(tabId))

  creationsEnCours.set(tabId, creation)
  return creation
}

export function registerTerminalIpc(): void {
  /**
   * Combien d'onglets chaque projet garde ouverts.
   *
   * Le rail les montre tous, alors que `term:list` ne rend que ceux d'un seul
   * projet. Sans ce compte, un projet quitté n'avait l'air de rien porter, et
   * l'on rouvrait un terminal là où trois attendaient déjà.
   */
  ipcMain.handle('term:comptes', (): Record<string, number> => {
    const comptes: Record<string, number> = {}
    for (const tab of store.get().tabs) {
      comptes[tab.workspaceId] = (comptes[tab.workspaceId] ?? 0) + 1
    }
    return comptes
  })

  /**
   * Les onglets d'un projet, dans l'ordre où ils ont été ouverts.
   *
   * Ils étaient rendus triés par dernière visite, ce qui faisait sauter la barre
   * d'onglets dès qu'on revenait sur un projet. Lequel était regardé se lit
   * maintenant sur `lastActiveAt`, sans toucher à leur rang.
   */
  ipcMain.handle('term:list', (_evenement, workspaceId: string) =>
    store.get().tabs.filter((t) => t.workspaceId === workspaceId)
  )

  ipcMain.handle(
    'term:create',
    (_evenement, workspaceId: string, options: Partial<Tab> = {}) => {
      const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
      if (!workspace) throw new Error(`Workspace inconnu : ${workspaceId}`)

      const id = randomUUID()
      const tab: Tab = {
        id,
        workspaceId,
        title: options.title ?? 'Terminal',
        cwd: workspace.path,
        tmuxSession: tmuxSessionName(workspaceId, id),
        lastActiveAt: Date.now(),
        ...options
      }
      store.update((etat) => {
        etat.tabs.push(tab)
        etat.activeTabId = id
      })
      return tab
    }
  )

  ipcMain.handle(
    'term:open',
    async (
      evenement,
      tabId: string,
      cols: number,
      rows: number
    ): Promise<OuvertureResultat> => {
      const tab = trouverTab(tabId)
      if (!tab) throw new Error(`Onglet inconnu : ${tabId}`)

      // L'écran d'avant n'a de sens que si la session a disparu : tant qu'elle
      // vit, tmux la redessine lui-même.
      const fichierEcran = (await multiplexeur.existe(tab.tmuxSession))
        ? undefined
        : await scrollback.chemin(tabId)

      const { preexistante } = await assurerSession(tabId, tab, cols, rows, fichierEcran)

      // Toujours réattacher : tmux ne redessine le contenu qu'à l'arrivée d'un
      // client, et c'est ce redessin qui remplit le terminal à l'écran.
      pty.attach(tabId, tab.tmuxSession, cols, rows, evenement.sender)

      // L'amorce a été jouée par la création de la session : elle ne doit plus
      // resservir, sous peine de relancer un agent déjà en place au prochain
      // réattachement.
      if (!preexistante && tab.commandeInitiale) {
        store.update((etat) => {
          const cible = etat.tabs.find((t) => t.id === tabId)
          if (cible) delete cible.commandeInitiale
        })
      }

      // L'attachement ne dit rien de ce que l'on regarde : voir `term:focus`.

      // La session recréée a déjà réaffiché l'écran d'avant ; le renderer n'a plus
      // qu'à proposer la reprise de ce qui y tournait.
      return { tab, reprise: preexistante, aRestaurer: !preexistante && Boolean(fichierEcran) }
    }
  )

  /**
   * Note l'onglet que l'on regarde.
   *
   * `term:open` en tenait lieu, et c'était faux : tous les onglets d'un projet
   * sont attachés dès qu'on l'ouvre, pas seulement celui du dessus. L'ordre de
   * dernière activité suivait donc l'ordre d'attachement, si bien que revenir
   * sur un projet rouvrait toujours son dernier onglet au lieu de celui qu'on
   * avait quitté.
   */
  ipcMain.handle('term:focus', (_evenement, tabId: string) => {
    store.update((etat) => {
      const cible = etat.tabs.find((t) => t.id === tabId)
      if (!cible) return
      cible.lastActiveAt = Date.now()
      etat.activeTabId = tabId
    })
  })

  ipcMain.on('term:input', (_evenement, tabId: string, donnees: string) => {
    pty.write(tabId, donnees)
  })

  ipcMain.on('term:resize', (_evenement, tabId: string, cols: number, rows: number) => {
    pty.resize(tabId, cols, rows)
  })

  /** Détache sans tuer : l'onglet disparaît de l'écran, la session tmux continue. */
  ipcMain.handle('term:detach', (_evenement, tabId: string) => {
    pty.detach(tabId)
  })

  /** Fermeture définitive : le pty est détaché et la session tmux détruite. */
  ipcMain.handle('term:close', async (_evenement, tabId: string) => {
    const tab = trouverTab(tabId)
    pty.detach(tabId)
    if (tab) await multiplexeur.detruire(tab.tmuxSession)
    await scrollback.oublier(tabId)
    store.update((etat) => {
      etat.tabs = etat.tabs.filter((t) => t.id !== tabId)
      if (etat.activeTabId === tabId) {
        // L'écran revient à l'onglet du même projet qu'on regardait avant celui
        // qu'on ferme, et non au dernier ouvert d'un projet quelconque.
        const voisins = etat.tabs.filter((t) => t.workspaceId === tab?.workspaceId)
        etat.activeTabId = dernierRegarde(voisins)?.id
      }
    })
    return store.get().tabs
  })

  ipcMain.handle('term:rename', (_evenement, tabId: string, titre: string) => {
    store.update((etat) => {
      const cible = etat.tabs.find((t) => t.id === tabId)
      if (cible) cible.title = titre
    })
    return trouverTab(tabId)
  })
}
