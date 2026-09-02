import { create } from 'zustand'
import type {
  Apercu,
  AppState,
  ClaudeSession,
  DoctorCheck,
  Entree,
  Tab,
  Workspace
} from '@shared/types'

interface EtatUi {
  workspaces: Workspace[]
  layout: AppState['layout']
  activeWorkspaceId?: string
  diagnostics: DoctorCheck[]
  diagnosticOuvert: boolean
  pret: boolean

  /** Onglets du workspace courant uniquement. */
  tabs: Tab[]
  activeTabId?: string

  /** Sessions Claude Code par workspace, chargées au dépli. */
  sessions: Record<string, ClaudeSession[]>
  sessionsEnCours: Record<string, boolean>
  /** Workspaces dont la liste de sessions est entièrement déroulée. */
  toutAfficher: Record<string, boolean>

  /** Contenu des dossiers déjà lus, indexé par chemin. */
  arbre: Record<string, Entree[]>
  dossiersOuverts: string[]
  fichierChoisi?: string
  apercu?: Apercu

  charger: () => Promise<void>
  ajouterWorkspace: () => Promise<void>
  retirerWorkspace: (id: string) => Promise<void>
  basculerRepli: (id: string) => Promise<void>
  choisirWorkspace: (id: string) => Promise<void>
  chargerOnglets: (workspaceId: string) => Promise<void>
  chargerSessions: (workspaceId: string) => Promise<void>
  ouvrirSession: (
    workspaceId: string,
    intention: 'nouvelle' | 'reprise' | 'bifurcation',
    uuid?: string
  ) => Promise<void>
  deroulerTout: (workspaceId: string) => void
  chargerDossier: (chemin: string) => Promise<void>
  basculerDossier: (chemin: string) => Promise<void>
  choisirFichier: (chemin: string) => Promise<void>
  fermerApercu: () => void
  rafraichirArbre: (racine: string) => Promise<void>
  nouvelOnglet: () => Promise<void>
  choisirOnglet: (id: string) => void
  fermerOnglet: (id: string) => Promise<void>
  enregistrerLayout: (layout: Partial<AppState['layout']>) => void
  ouvrirDiagnostic: (ouvert: boolean) => void
  relancerDiagnostic: () => Promise<void>
  appliquerCorrectifRetention: () => Promise<string>
}

export const useStore = create<EtatUi>((set, get) => ({
  workspaces: [],
  layout: { leftWidth: 260, middleWidth: 300 },
  diagnostics: [],
  diagnosticOuvert: false,
  pret: false,
  tabs: [],
  sessions: {},
  sessionsEnCours: {},
  toutAfficher: {},
  arbre: {},
  dossiersOuverts: [],

  charger: async () => {
    const [etat, diagnostics] = await Promise.all([
      window.claudex.state.get(),
      window.claudex.doctor.check()
    ])
    set({
      workspaces: etat.workspaces,
      layout: etat.layout,
      activeWorkspaceId: etat.activeWorkspaceId,
      diagnostics,
      // Le diagnostic ne s'impose que s'il a quelque chose à signaler.
      diagnosticOuvert: diagnostics.some((d) => d.severity !== 'ok'),
      pret: true
    })
    if (etat.activeWorkspaceId) {
      await get().chargerOnglets(etat.activeWorkspaceId)
      const courant = etat.workspaces.find((w) => w.id === etat.activeWorkspaceId)
      if (courant) {
        await get().chargerDossier(courant.path)
        void window.claudex.fs.observer(courant.path)
      }
    }
    // Les sessions des projets déjà dépliés sont chargées d'emblée : la colonne
    // de gauche doit être utile dès l'ouverture, sans un clic de plus.
    await Promise.all(
      etat.workspaces.filter((w) => w.expanded).map((w) => get().chargerSessions(w.id))
    )
  },

  ajouterWorkspace: async () => {
    const ajoute = await window.claudex.workspace.add()
    if (!ajoute) return
    set({
      workspaces: await window.claudex.workspace.list(),
      activeWorkspaceId: ajoute.id
    })
    await get().chargerOnglets(ajoute.id)
  },

  retirerWorkspace: async (id) => {
    const workspaces = await window.claudex.workspace.remove(id)
    set({
      workspaces,
      activeWorkspaceId: get().activeWorkspaceId === id ? workspaces[0]?.id : get().activeWorkspaceId
    })
  },

  basculerRepli: async (id) => {
    const courant = get().workspaces.find((w) => w.id === id)
    if (!courant) return
    const ouvert = !courant.expanded
    set({ workspaces: await window.claudex.workspace.update(id, { expanded: ouvert }) })
    if (ouvert) await get().chargerSessions(id)
  },

  choisirWorkspace: async (id) => {
    if (get().activeWorkspaceId === id) return
    const precedent = get().workspaces.find((w) => w.id === get().activeWorkspaceId)
    if (precedent) void window.claudex.fs.cesserObservation(precedent.path)

    set({
      activeWorkspaceId: id,
      // L'arbre appartient au projet qu'on quitte : le garder afficherait les
      // fichiers du précédent sous le nom du nouveau.
      arbre: {},
      dossiersOuverts: [],
      fichierChoisi: undefined,
      apercu: undefined
    })
    await window.claudex.state.setActiveWorkspace(id)

    const courant = get().workspaces.find((w) => w.id === id)
    if (courant) {
      await get().chargerDossier(courant.path)
      void window.claudex.fs.observer(courant.path)
    }
    await get().chargerOnglets(id)
  },

  chargerOnglets: async (workspaceId) => {
    const tabs = await window.claudex.term.list(workspaceId)
    set({ tabs, activeTabId: tabs.at(-1)?.id })
  },

  chargerSessions: async (workspaceId) => {
    set({ sessionsEnCours: { ...get().sessionsEnCours, [workspaceId]: true } })
    try {
      const sessions = await window.claudex.claude.listSessions(workspaceId)
      set({ sessions: { ...get().sessions, [workspaceId]: sessions } })
    } finally {
      set({ sessionsEnCours: { ...get().sessionsEnCours, [workspaceId]: false } })
    }
  },

  ouvrirSession: async (workspaceId, intention, uuid) => {
    // Une session déjà ouverte ne se dédouble pas : on bascule sur son onglet.
    if (intention === 'reprise' && uuid) {
      const existant = get().tabs.find((t) => t.claudeSessionId === uuid)
      if (existant) {
        set({ activeTabId: existant.id })
        return
      }
    }
    if (get().activeWorkspaceId !== workspaceId) await get().choisirWorkspace(workspaceId)
    const tab = await window.claudex.claude.ouvrir(workspaceId, intention, uuid)
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
  },

  deroulerTout: (workspaceId) =>
    set({ toutAfficher: { ...get().toutAfficher, [workspaceId]: true } }),

  chargerDossier: async (chemin) => {
    try {
      const entrees = await window.claudex.fs.lireDossier(chemin)
      set({ arbre: { ...get().arbre, [chemin]: entrees } })
    } catch {
      // Dossier disparu ou illisible : on l'oublie plutôt que de casser l'arbre.
      const arbre = { ...get().arbre }
      delete arbre[chemin]
      set({ arbre })
    }
  },

  basculerDossier: async (chemin) => {
    const ouverts = get().dossiersOuverts
    if (ouverts.includes(chemin)) {
      set({ dossiersOuverts: ouverts.filter((d) => d !== chemin) })
      return
    }
    set({ dossiersOuverts: [...ouverts, chemin] })
    if (!get().arbre[chemin]) await get().chargerDossier(chemin)
  },

  choisirFichier: async (chemin) => {
    set({ fichierChoisi: chemin, apercu: undefined })
    try {
      const apercu = await window.claudex.fs.lireApercu(chemin)
      // Une lecture lente ne doit pas écraser un choix plus récent.
      if (get().fichierChoisi === chemin) set({ apercu })
    } catch {
      if (get().fichierChoisi === chemin) set({ apercu: undefined })
    }
  },

  fermerApercu: () => set({ fichierChoisi: undefined, apercu: undefined }),

  /** Relit les dossiers déjà ouverts sous une racine, après un changement disque. */
  rafraichirArbre: async (racine) => {
    const aRelire = Object.keys(get().arbre).filter((d) => d === racine || d.startsWith(`${racine}/`))
    await Promise.all(aRelire.map((d) => get().chargerDossier(d)))
  },

  nouvelOnglet: async () => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const tab = await window.claudex.term.create(workspaceId)
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
  },

  choisirOnglet: (id) => set({ activeTabId: id }),

  fermerOnglet: async (id) => {
    await window.claudex.term.close(id)
    const restants = get().tabs.filter((t) => t.id !== id)
    set({
      tabs: restants,
      activeTabId: get().activeTabId === id ? restants.at(-1)?.id : get().activeTabId
    })
  },

  enregistrerLayout: (layout) => {
    set({ layout: { ...get().layout, ...layout } })
    void window.claudex.state.setLayout(layout)
  },

  ouvrirDiagnostic: (ouvert) => set({ diagnosticOuvert: ouvert }),

  relancerDiagnostic: async () => set({ diagnostics: await window.claudex.doctor.check() }),

  appliquerCorrectifRetention: async () => {
    const resultat = await window.claudex.doctor.applySettingsFix()
    set({ diagnostics: await window.claudex.doctor.check() })
    return resultat.message
  }
}))
