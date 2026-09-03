import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { ClaudeSession, Tab } from '@shared/types'
import { RANGEMENT_VIDE, oublier, type Rangement } from '@shared/rangement'
import { join } from 'node:path'
import { listerSessions } from '../services/claude-projects'
import { ecarter } from '../services/corbeille'
import { surveiller } from '../services/session-watcher'
import * as store from '../services/store'
import { proteger } from '../services/tmux'
import { claudeProjectPath, tmuxSessionName } from '../util/paths'

export type Intention = 'nouvelle' | 'reprise' | 'bifurcation'

function workspaceDe(workspaceId: string): { path: string } {
  const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
  if (!workspace) throw new Error(`Workspace inconnu : ${workspaceId}`)
  return workspace
}

/**
 * Crée un onglet destiné à porter une session d'agent, avec la commande qui
 * l'amorcera dès que sa session tmux existera.
 *
 * - `nouvelle`    : Claudex impose l'identifiant, et le connaît donc avant même que
 *                   Claude Code ne démarre — c'est ce qui rend la session
 *                   reprenable plus tard sans passer par un sélecteur.
 * - `reprise`     : rouvre une conversation existante avec tout son contexte.
 * - `bifurcation` : repart du même contexte sous un nouvel identifiant, l'original
 *                   restant intact. Cet identifiant est généré par Claude Code ;
 *                   c'est le veilleur de sessions qui le rattachera à l'onglet.
 */
function creerOngletAgent(
  workspaceId: string,
  intention: Intention,
  uuid?: string,
  titreSession?: string
): Tab {
  const workspace = workspaceDe(workspaceId)
  const id = randomUUID()

  let sessionId: string | undefined
  let commande: string
  let titre: string

  switch (intention) {
    case 'nouvelle': {
      sessionId = randomUUID()
      commande = `claude --session-id ${sessionId}`
      titre = titreSession ?? 'Nouvel agent'
      break
    }
    case 'reprise': {
      if (!uuid) throw new Error('Reprise sans identifiant de session')
      sessionId = uuid
      commande = `claude -r ${uuid}`
      // Le titre de la conversation vaut mieux qu'un « Agent » indifférencié :
      // avec plusieurs onglets ouverts, c'est le seul repère utile.
      titre = titreSession ?? 'Agent'
      break
    }
    case 'bifurcation': {
      if (!uuid) throw new Error('Bifurcation sans identifiant de session')
      sessionId = undefined
      // Le nom vient de l'utilisateur, qui l'a choisi pour dire ce qu'il explore :
      // le décorer d'un symbole le dénaturerait. La pastille de l'onglet et le
      // lien vers l'origine disent déjà que c'est une branche.
      titre = titreSession ?? 'Branche'
      // `--name` le donne aussi à Claude Code, qui l'affichera dans son invite
      // et dans son propre sélecteur de sessions : le nom vaut alors partout,
      // pas seulement dans Claudex.
      commande = `claude -r ${uuid} --fork-session --name ${proteger(titre)}`
      break
    }
  }

  const tab: Tab = {
    id,
    workspaceId,
    title: titre,
    cwd: workspace.path,
    tmuxSession: tmuxSessionName(workspaceId, id),
    claudeSessionId: sessionId,
    claudeProjectDir: claudeProjectPath(workspace.path),
    forkedFrom: intention === 'bifurcation' ? uuid : undefined,
    commandeInitiale: commande,
    lastActiveAt: Date.now()
  }

  store.update((etat) => {
    etat.tabs.push(tab)
    etat.activeTabId = id
  })

  return tab
}

/**
 * Nettoie un rangement venu de l'interface avant de l'écrire.
 *
 * Ce que l'on persiste finit relu au démarrage suivant : mieux vaut refuser une
 * structure douteuse tout de suite que de la retrouver sous forme d'écran vide
 * après un redémarrage.
 */
function assainir(brut: unknown): Rangement {
  if (!brut || typeof brut !== 'object') return RANGEMENT_VIDE
  const { ordre, groupes } = brut as Partial<Rangement>

  const groupesPropres: Record<string, { nom: string; replie?: boolean; sessions: string[] }> = {}
  for (const [id, groupe] of Object.entries(groupes ?? {})) {
    if (!groupe || typeof groupe !== 'object') continue
    groupesPropres[id] = {
      nom: String(groupe.nom ?? '').trim().slice(0, 60) || 'Groupe',
      replie: groupe.replie === true,
      sessions: (groupe.sessions ?? []).filter((s): s is string => typeof s === 'string')
    }
  }

  return {
    ordre: (ordre ?? []).filter(
      (e): e is Rangement['ordre'][number] =>
        !!e &&
        typeof e === 'object' &&
        typeof e.id === 'string' &&
        (e.type === 'groupe' ? groupesPropres[e.id] !== undefined : e.type === 'session')
    ),
    groupes: groupesPropres
  }
}

export function registerClaudeIpc(): void {
  ipcMain.handle(
    'claude:listSessions',
    (evenement, workspaceId: string): Promise<ClaudeSession[]> => {
      const chemin = workspaceDe(workspaceId).path
      // Ouvrir un projet, c'est s'y intéresser : on se met dès lors à guetter les
      // conversations qui y naissent, y compris celles lancées à la main.
      void surveiller(chemin, evenement.sender)
      const etat = store.get()
      return listerSessions(
        chemin,
        etat.nomsSessions ?? {},
        etat.etiquettes ?? {},
        etat.favoris ?? []
      )
    }
  )

  ipcMain.handle(
    'claude:rangement',
    (_evenement, workspaceId: string): Rangement =>
      store.get().rangements?.[workspaceId] ?? RANGEMENT_VIDE
  )

  ipcMain.handle('claude:arranger', (_evenement, workspaceId: string, rangement: unknown) => {
    store.update((etat) => {
      const rangements = (etat.rangements ??= {})
      rangements[workspaceId] = assainir(rangement)
    })
  })

  ipcMain.handle('claude:favori', (_evenement, uuid: string, favori: boolean) => {
    store.update((etat) => {
      const favoris = new Set(etat.favoris ?? [])
      if (favori) favoris.add(uuid)
      else favoris.delete(uuid)
      etat.favoris = [...favoris]
    })
  })

  /**
   * Écarte une conversation : son transcrit rejoint la corbeille de Claudex, et
   * ce qu'on lui avait attaché — nom, étiquette, favori — s'en va avec elle.
   */
  ipcMain.handle(
    'claude:ecarter',
    async (_evenement, workspaceId: string, uuid: string): Promise<string> => {
      const chemin = join(claudeProjectPath(workspaceDe(workspaceId).path), `${uuid}.jsonl`)
      const destination = await ecarter(chemin)
      store.update((etat) => {
        delete etat.nomsSessions?.[uuid]
        delete etat.etiquettes?.[uuid]
        etat.favoris = (etat.favoris ?? []).filter((f) => f !== uuid)
        const range = etat.rangements?.[workspaceId]
        if (range) etat.rangements![workspaceId] = oublier(range, uuid)
      })
      return destination
    }
  )

  ipcMain.handle('claude:etiqueter', (_evenement, uuid: string, texte: string) => {
    store.update((etat) => {
      const etiquettes = (etat.etiquettes ??= {})
      const propre = texte.trim().slice(0, 40)
      if (propre) etiquettes[uuid] = propre
      else delete etiquettes[uuid]
    })
  })

  ipcMain.handle('claude:nommer', (_evenement, uuid: string, nom: string) => {
    store.update((etat) => {
      const noms = (etat.nomsSessions ??= {})
      const propre = nom.trim()
      if (propre) noms[uuid] = propre
      else delete noms[uuid]
    })
  })

  ipcMain.handle(
    'claude:ouvrir',
    (
      _evenement,
      workspaceId: string,
      intention: Intention,
      uuid?: string,
      titre?: string
    ): Tab => creerOngletAgent(workspaceId, intention, uuid, titre)
  )
}
