import { create } from 'zustand'
import { dernierRegarde, voisin } from '@shared/onglets'
import { rangerSelon } from '@shared/ordre'
import { manquesDuPont } from '@shared/pont'
import {
  RANGEMENT_VIDE,
  creerGroupe,
  deplacer,
  dissoudreGroupe,
  materialiser,
  renommerGroupe,
  replierGroupe,
  type Cible,
  type Element,
  type Rangement
} from '@shared/rangement'
import type {
  Apercu,
  AppState,
  ClaudeSession,
  DoctorCheck,
  Entree,
  EtatGit,
  ServiceVu,
  Sollicitation,
  Tab,
  Workspace
} from '@shared/types'
import type { Vue } from './vues'

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
  /**
   * Combien d'onglets chaque projet garde ouverts, par identifiant de projet.
   *
   * Le rail montre tous les projets, alors que `tabs` ne porte que ceux du
   * projet courant. Sans ce compte, un projet quitté avait l'air de ne rien
   * tenir, et l'on rouvrait un terminal là où trois attendaient déjà.
   */
  comptesOnglets: Record<string, number>

  /**
   * Services déclarés par projet, avec leur état.
   *
   * Un service n'est pas une conversation : il ne vit pas dans `tabs` et
   * n'apparaît jamais dans la barre d'onglets. Son état se relit à intervalle
   * régulier tant qu'on le regarde, un démarrage passant par plusieurs états.
   */
  services: Record<string, ServiceVu[]>
  /**
   * Journaux ouverts, par projet.
   *
   * Elles prennent la place du terminal sans le démonter, mais ne sont pas de
   * même nature qu'un onglet. Un onglet *est* la session, et la fermer la tue.
   * Une vue n'est qu'un regard posé sur ce qui existe ailleurs, et la fermer
   * ne touche à rien : le service continue de tourner, le fichier reste.
   */
  vues: Record<string, Vue[]>
  /**
   * Groupes de services repliés, par projet.
   *
   * Onze services back tiennent la colonne entière : les replier rend visibles
   * les autres groupes sans avoir à faire défiler. Le repli vit ici et non dans
   * le composant, sans quoi il se déferait à chaque passage sur une autre page.
   */
  groupesReplies: Record<string, string[]>
  replierGroupeService: (workspaceId: string, groupe: string) => void
  /** La vue regardée, s'il en est une. Sinon, c'est le terminal qu'on voit. */
  vueActive?: string
  /** Ouvre une vue, ou revient dessus si elle l'est déjà. */
  ouvrirVue: (workspaceId: string, vue: Vue) => void
  fermerVue: (workspaceId: string, id: string) => void
  chargerServices: (workspaceId: string) => Promise<void>
  demarrerServices: (workspaceId: string, noms: string[]) => Promise<void>
  arreterServices: (workspaceId: string, noms: string[]) => Promise<void>
  /** Tue ce qui tient le port d'un service, quand ce n'est pas Claudex. */
  libererPort: (workspaceId: string, nom: string) => Promise<number[]>
  /** Arrête puis redémarre un service que Claudex tient. */
  relancerService: (workspaceId: string, nom: string) => Promise<void>
  /** Tue ce qui tient le port, puis démarre le service sous Claudex. */
  reprendrePort: (workspaceId: string, nom: string) => Promise<void>

  /** Sessions Claude Code par workspace, chargées au dépli. */
  sessions: Record<string, ClaudeSession[]>
  /** Ordre voulu et groupes, par workspace. */
  rangements: Record<string, Rangement>

  /**
   * Groupes et ordre du rail des projets.
   *
   * Le même modèle que celui des conversations, appliqué à une autre liste :
   * un projet et une conversation n'ont en commun que d'avoir un identifiant,
   * et c'est tout ce dont le rangement a besoin.
   */
  rangementProjets: Rangement
  ouvrirGroupeProjets: (index?: number, avec?: string[]) => Promise<string>
  nommerGroupeProjets: (id: string, nom: string) => Promise<void>
  replierGroupeProjets: (id: string, replie: boolean) => Promise<void>
  defaireGroupeProjets: (id: string) => Promise<void>
  deplacerProjet: (quoi: Element, cible: Cible) => Promise<void>
  /** Groupe du rail dont le nom attend d'être saisi. */
  groupeProjetANommer?: string
  finirNommageProjet: () => void
  /**
   * Groupe qui vient d'être créé et attend son nom.
   *
   * Le bouton qui le crée vit dans l'en-tête de la colonne, la ligne à nommer
   * dans la liste : l'état passe par ici plutôt que par une chaîne de props.
   */
  groupeANommer?: string
  sessionsEnCours: Record<string, boolean>
  /** Workspaces dont la liste de sessions est entièrement déroulée. */
  toutAfficher: Record<string, boolean>

  /**
   * Conversations qui réclament leur utilisateur, par identifiant.
   *
   * Vient du processus main, qui reçoit les hooks de Claude Code ; l'interface
   * ne fait que l'afficher et demander l'extinction quand on revient dessus.
   */
  sollicitations: Record<string, Sollicitation>

  /** Onglet de la colonne latérale : les conversations ou les fichiers. */
  panneau: 'sessions' | 'fichiers' | 'services' | 'git'
  /** Filtre de la liste des sessions. */
  filtre: string
  /** État git du projet courant, pour la barre de statut et la page Git. */
  git?: EtatGit | null
  /**
   * Dépôts repliés, par projet.
   *
   * Seize dépôts dont onze ont des changements tiennent plus que la colonne :
   * les replier rend visibles les autres. Le repli vit ici et non dans le
   * composant, sans quoi il se déferait à chaque passage sur une autre page.
   */
  depotsReplies: Record<string, string[]>
  replierDepot: (workspaceId: string, depot: string) => void
  /**
   * Fichiers cochés, par leur clé `dépôt fichier`.
   *
   * Une liste plutôt qu'un ensemble : zustand compare par référence, et un
   * `Set` muté ne redessinerait rien. La sélection traverse les projets sans
   * dommage, puisque la clé porte le chemin absolu du dépôt.
   */
  coches: string[]
  cocher: (cles: string[], coche: boolean) => void
  /**
   * Dépôts cochés, par leur chemin.
   *
   * Une sélection à part de celle des fichiers : cocher un dépôt vise ce qu'on
   * fait au dépôt entier, pousser ou changer de branche, non ce qui part au
   * prochain commit.
   */
  depotsCoches: string[]
  cocherDepots: (chemins: string[], coche: boolean) => void
  /** Forme du diff, retenue d'un fichier à l'autre. */
  diffCoteACote: boolean
  basculerDiffCoteACote: () => void
  /**
   * Le fichier entier plutôt que les seuls changements.
   *
   * Vrai par défaut, comme dans IntelliJ, qui montre tout et propose de
   * replier. Trois lignes de contexte font des îlots que l'on saute : on ne
   * voit pas ce qu'un changement touche autour de lui.
   */
  diffEntier: boolean
  basculerDiffEntier: () => void

  /** Conversation dont on s'apprête à bifurquer, le temps de la nommer. */
  bifurcationEnCours?: { workspaceId: string; uuid: string; titre: string }

  /**
   * Contenu des dossiers déjà lus, indexé par chemin absolu.
   *
   * Conservé d'un projet à l'autre : les chemins sont absolus, donc sans
   * collision, et revenir sur un projet doit être immédiat plutôt que de
   * reparcourir ce qu'on vient de quitter.
   */
  arbre: Record<string, Entree[]>
  /** Dossiers dépliés, par projet, pour retrouver l'arbre tel qu'on l'a laissé. */
  dossiersOuverts: Record<string, string[]>
  /** Dossiers en cours de lecture, pour ne pas laisser l'écran muet. */
  lectureEnCours: string[]
  fichierChoisi?: string
  apercu?: Apercu

  charger: () => Promise<void>
  ajouterWorkspace: (chemin?: string) => Promise<void>
  retirerWorkspace: (id: string) => Promise<void>
  basculerRepli: (id: string) => Promise<void>
  choisirWorkspace: (id: string) => Promise<void>
  chargerOnglets: (workspaceId: string) => Promise<void>
  /** Relit le nombre d'onglets de chaque projet. */
  rafraichirComptes: () => Promise<void>
  /** Range les projets dans l'ordre donné, et le retient. */
  rangerWorkspaces: (ids: string[]) => Promise<void>
  chargerSessions: (workspaceId: string) => Promise<void>
  ouvrirSession: (
    workspaceId: string,
    intention: 'nouvelle' | 'reprise' | 'bifurcation',
    uuid?: string,
    titre?: string
  ) => Promise<void>
  deroulerTout: (workspaceId: string) => void
  /** Déplace une conversation ou un groupe à l'endroit visé. */
  deplacerElement: (workspaceId: string, quoi: Element, cible: Cible) => Promise<void>
  /** Crée un groupe, éventuellement autour d'une conversation. Renvoie son identifiant. */
  ouvrirGroupe: (workspaceId: string, index?: number, avec?: string[]) => Promise<string>
  nommerGroupe: (workspaceId: string, id: string, nom: string) => Promise<void>
  finirNommage: () => void
  replierGroupeSessions: (workspaceId: string, id: string, replie: boolean) => Promise<void>
  defaireGroupe: (workspaceId: string, id: string) => Promise<void>
  choisirPanneau: (panneau: 'sessions' | 'fichiers' | 'services' | 'git') => void
  demanderBifurcation: (workspaceId: string, uuid: string, titre: string) => void
  etiqueter: (workspaceId: string, uuid: string, texte: string) => Promise<void>
  renommer: (workspaceId: string, uuid: string, titre: string) => Promise<void>
  basculerFavori: (workspaceId: string, uuid: string, favori: boolean) => Promise<void>
  ecarterSession: (workspaceId: string, session: ClaudeSession) => Promise<void>
  /** Conversation dont l'écart est proposé, le temps de le confirmer. */
  ecartEnCours?: { workspaceId: string; session: ClaudeSession }
  confirmerEcart: () => Promise<void>
  annulerEcart: () => void
  annulerBifurcation: () => void
  confirmerBifurcation: (nom: string) => Promise<void>
  filtrer: (filtre: string) => void
  rafraichirGit: () => Promise<void>
  chargerDossier: (chemin: string) => Promise<void>
  basculerDossier: (chemin: string) => Promise<void>
  choisirFichier: (chemin: string) => Promise<void>
  fermerApercu: () => void
  rafraichirArbre: (racine: string) => Promise<void>
  nouvelOnglet: () => Promise<void>
  choisirOnglet: (id: string) => void
  /** Passe à l'onglet voisin : +1 le suivant, -1 le précédent. */
  ongletVoisin: (pas: number) => void
  /** Reçoit du main la liste des conversations qui attendent. */
  poserSollicitations: (sollicitations: Record<string, Sollicitation>) => void
  fermerOnglet: (id: string) => Promise<void>
  /** Ferme plusieurs onglets d'affilée, et leurs sessions avec eux. */
  fermerOnglets: (ids: string[]) => Promise<void>
  enregistrerLayout: (layout: Partial<AppState['layout']>) => void
  replier: (quoi: 'rail' | 'colonne') => void
  ouvrirDiagnostic: (ouvert: boolean) => void
  relancerDiagnostic: () => Promise<void>
  appliquerCorrectif: (action: NonNullable<DoctorCheck['fix']>['action']) => Promise<string>
}

type Poser = (partiel: Partial<EtatUi>) => void
type Lire = () => EtatUi

/**
 * Éteint le voyant de la conversation qu'un onglet porte.
 *
 * Appelée depuis tous les chemins qui amènent un onglet à l'écran sur un geste
 * de l'utilisateur : le clic sur l'onglet, mais aussi le clic sur la
 * conversation dans la colonne, qui ouvre l'onglet sans passer par le premier.
 * Le voyant restait alors allumé devant la conversation qu'on était en train
 * de lire.
 *
 * Le démarrage n'en fait pas partie : une demande arrivée pendant l'absence
 * doit être encore là au retour.
 */
function apaiserOnglet(get: Lire, tabId?: string): void {
  const uuid = get().tabs.find((t) => t.id === tabId)?.claudeSessionId
  if (uuid && get().sollicitations[uuid]) void window.claudex.claude.apaiser(uuid)
}

/**
 * Applique un rangement : à l'écran d'abord, sur le disque ensuite.
 *
 * Un déplacement doit se voir à l'instant où on lâche la souris ; attendre
 * l'écriture donnerait un temps mort à chaque geste.
 */
async function enregistrerRangement(
  workspaceId: string,
  rangement: Rangement,
  set: Poser,
  get: Lire
): Promise<void> {
  set({ rangements: { ...get().rangements, [workspaceId]: rangement } })
  await window.claudex.claude.arranger(workspaceId, rangement)
}

/** Applique un rangement du rail : à l'écran d'abord, sur le disque ensuite. */
async function enregistrerRangementProjets(
  rangement: Rangement,
  set: Poser,
  get: Lire
): Promise<void> {
  set({ rangementProjets: rangement })
  await window.claudex.workspace.arranger(rangement)
}

export const useStore = create<EtatUi>((set, get) => ({
  workspaces: [],
  layout: { leftWidth: 260, middleWidth: 300 },
  diagnostics: [],
  diagnosticOuvert: false,
  pret: false,
  tabs: [],
  comptesOnglets: {},
  services: {},
  vues: {},
  depotsReplies: {},
  coches: [],
  depotsCoches: [],
  diffCoteACote: true,
  diffEntier: true,
  groupesReplies: {},
  sessions: {},
  rangements: {},
  rangementProjets: RANGEMENT_VIDE,
  sessionsEnCours: {},
  toutAfficher: {},
  sollicitations: {},
  arbre: {},
  dossiersOuverts: {},
  lectureEnCours: [],
  panneau: 'sessions',
  filtre: '',

  charger: async () => {
    // Un pont incomplet fait échouer des actions en silence : mieux vaut le dire
    // avant que l'utilisateur ne voie une saisie disparaître sans explication.
    const manques = manquesDuPont(window.claudex)
    if (manques.length > 0) {
      set({
        diagnostics: [
          {
            id: 'pont',
            label: 'Application à relancer',
            severity: 'error',
            detail:
              `Le pont entre l'interface et le système est incomplet (${manques.join(', ')}). ` +
              "Cela arrive en développement : le preload ne se recharge qu'au redémarrage " +
              "complet d'Electron, là où l'interface se met à jour toute seule. Relance " +
              'Claudex — sans cela, certaines actions échoueront sans rien dire.'
          }
        ],
        diagnosticOuvert: true,
        pret: true
      })
      return
    }

    const [etat, diagnostics, rangementProjets] = await Promise.all([
      window.claudex.state.get(),
      window.claudex.doctor.check(),
      window.claudex.workspace.rangement()
    ])
    set({
      rangementProjets,
      workspaces: etat.workspaces,
      layout: etat.layout,
      activeWorkspaceId: etat.activeWorkspaceId,
      sollicitations: etat.sollicitations ?? {},
      diagnostics,
      // Le diagnostic ne s'impose que devant une panne ou une perte en cours.
      // Le reste se signale par la pastille de la barre du haut, et s'ouvre
      // quand on veut bien s'en occuper.
      diagnosticOuvert: diagnostics.some((d) => d.severity === 'error' || d.impose),
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
    // Les conversations du projet courant sont chargées d'emblée : la colonne
    // doit être utile dès l'ouverture, sans un clic de plus.
    if (etat.activeWorkspaceId) {
      await get().chargerSessions(etat.activeWorkspaceId)
      void get().rafraichirGit()
    }
  },

  ajouterWorkspace: async (chemin) => {
    const ajoute = await window.claudex.workspace.add(chemin)
    if (!ajoute) return
    set({
      workspaces: await window.claudex.workspace.list(),
      activeWorkspaceId: ajoute.id
    })
    await get().chargerOnglets(ajoute.id)
    // Les conversations du dossier sont lues aussitôt : un projet qu'on vient
    // d'ajouter s'ouvrait sur une colonne vide, et il fallait penser au bouton
    // de synchronisation pour voir ce qu'il contenait déjà.
    await get().chargerSessions(ajoute.id)
    void get().rafraichirGit()
  },

  rafraichirComptes: async () => {
    set({ comptesOnglets: await window.claudex.term.comptes() })
  },

  rangerWorkspaces: async (ids) => {
    // L'ordre s'applique à l'écran avant d'être écrit : un rangement doit se
    // voir à l'instant où on lâche la souris.
    set({ workspaces: rangerSelon(get().workspaces, ids) })
    set({ workspaces: await window.claudex.workspace.ranger(ids) })
  },

  retirerWorkspace: async (id) => {
    const partait = get().activeWorkspaceId === id
    const retire = get().workspaces.find((w) => w.id === id)
    const workspaces = await window.claudex.workspace.remove(id)
    // Le dossier n'est plus regardé par personne : continuer à en suivre les
    // écritures ferait vivre un veilleur sur un projet qui n'existe plus.
    if (retire) void window.claudex.fs.cesserObservation(retire.path)
    set({ workspaces })
    void get().rafraichirComptes()
    if (!partait) return

    // Le projet retiré emportait l'écran. On en montre un autre en entier, ses
    // fichiers comme ses conversations, plutôt qu'une colonne vide sans un mot.
    const suivant = workspaces[0]?.id
    if (!suivant) {
      set({ activeWorkspaceId: undefined, tabs: [], fichierChoisi: undefined, apercu: undefined })
      return
    }
    await get().choisirWorkspace(suivant)
    await get().chargerSessions(suivant)
    void get().rafraichirGit()
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
      fichierChoisi: undefined,
      apercu: undefined,
      filtre: '',
      git: undefined
    })
    await window.claudex.state.setActiveWorkspace(id)

    const courant = get().workspaces.find((w) => w.id === id)
    if (courant) {
      // Déjà lu : on affiche sans attendre et l'on rafraîchit derrière.
      if (get().arbre[courant.path]) void get().chargerDossier(courant.path)
      else await get().chargerDossier(courant.path)
      void window.claudex.fs.observer(courant.path)
    }
    await get().chargerOnglets(id)
    // Les conversations suivent le même principe que l'arbre : déjà lues, on les
    // montre et l'on relit derrière. Sans cela, arriver sur un projet ouvrait
    // une colonne vide qu'il fallait penser à synchroniser à la main.
    if (get().sessions[id]) void get().chargerSessions(id)
    else await get().chargerSessions(id)
    void get().chargerServices(id)
    // L'état git est vidé plus haut parce qu'il appartient au projet qu'on
    // quitte. Sans cette relecture, rien ne le remplissait avant le battement
    // de quinze secondes de la bande du haut : la page Git restait sur
    // « Lecture… » jusqu'à ce qu'on pense au bouton.
    void get().rafraichirGit()
  },

  chargerOnglets: async (workspaceId) => {
    const tabs = await window.claudex.term.list(workspaceId)
    void get().rafraichirComptes()
    // L'onglet regardé le reste s'il est toujours là. Relire la liste sert aussi
    // à rattraper ce que le processus principal a changé de son côté, et cela ne
    // doit pas déplacer l'écran sous les yeux de qui n'a rien demandé.
    //
    // Sinon on reprend celui qu'on regardait en quittant ce projet, plutôt que
    // le dernier de la barre : c'est ce qui fait qu'un projet retrouvé s'ouvre
    // là où on l'avait laissé.
    const courant = get().activeTabId
    const retenu = tabs.some((t) => t.id === courant) ? courant : dernierRegarde(tabs)?.id
    set({ tabs, activeTabId: retenu })
    if (retenu && retenu !== courant) void window.claudex.term.focus(retenu)
  },

  ouvrirVue: (workspaceId, vue) => {
    const ouvertes = get().vues[workspaceId] ?? []
    const deja = ouvertes.some((v) => v.id === vue.id)
    set({
      vues: deja ? get().vues : { ...get().vues, [workspaceId]: [...ouvertes, vue] },
      vueActive: vue.id
    })
  },

  replierDepot: (workspaceId, depot) => {
    const replies = get().depotsReplies[workspaceId] ?? []
    set({
      depotsReplies: {
        ...get().depotsReplies,
        [workspaceId]: replies.includes(depot)
          ? replies.filter((d) => d !== depot)
          : [...replies, depot]
      }
    })
  },

  basculerDiffCoteACote: () => set({ diffCoteACote: !get().diffCoteACote }),

  basculerDiffEntier: () => set({ diffEntier: !get().diffEntier }),

  cocherDepots: (chemins, coche) => {
    const restants = get().depotsCoches.filter((c) => !chemins.includes(c))
    set({ depotsCoches: coche ? [...restants, ...chemins] : restants })
  },

  cocher: (cles, coche) => {
    const restantes = get().coches.filter((c) => !cles.includes(c))
    set({ coches: coche ? [...restantes, ...cles] : restantes })
  },

  replierGroupeService: (workspaceId, groupe) => {
    const replies = get().groupesReplies[workspaceId] ?? []
    set({
      groupesReplies: {
        ...get().groupesReplies,
        [workspaceId]: replies.includes(groupe)
          ? replies.filter((g) => g !== groupe)
          : [...replies, groupe]
      }
    })
  },

  fermerVue: (workspaceId, id) => {
    const restantes = (get().vues[workspaceId] ?? []).filter((v) => v.id !== id)
    set({
      vues: { ...get().vues, [workspaceId]: restantes },
      // Fermer celle qu'on regardait rend l'écran au terminal, jamais à une
      // vue voisine qu'on n'a pas demandée.
      vueActive: get().vueActive === id ? undefined : get().vueActive
    })
  },

  chargerServices: async (workspaceId) => {
    const vus = await window.claudex.services.etats(workspaceId)
    set({ services: { ...get().services, [workspaceId]: vus } })
  },

  demarrerServices: async (workspaceId, noms) => {
    await window.claudex.services.demarrer(workspaceId, noms)
    await get().chargerServices(workspaceId)
  },

  arreterServices: async (workspaceId, noms) => {
    await window.claudex.services.arreter(workspaceId, noms)
    await get().chargerServices(workspaceId)
  },

  libererPort: async (workspaceId, nom) => {
    const pids = await window.claudex.services.liberer(workspaceId, nom)
    await get().chargerServices(workspaceId)
    return pids
  },

  relancerService: async (workspaceId, nom) => {
    await window.claudex.services.arreter(workspaceId, [nom])
    await window.claudex.services.demarrer(workspaceId, [nom])
    await get().chargerServices(workspaceId)
  },

  // Tuer puis démarrer : le geste qu'on veut quand un service traîne d'une
  // exécution précédente et tient le port qu'on réclame.
  reprendrePort: async (workspaceId, nom) => {
    await window.claudex.services.liberer(workspaceId, nom)
    await window.claudex.services.demarrer(workspaceId, [nom])
    await get().chargerServices(workspaceId)
  },

  chargerSessions: async (workspaceId) => {
    set({ sessionsEnCours: { ...get().sessionsEnCours, [workspaceId]: true } })
    try {
      // Les conversations et leur rangement se lisent d'un même geste : afficher
      // les unes sans l'autre ferait sauter la liste sous les yeux.
      const [sessions, rangement] = await Promise.all([
        window.claudex.claude.listSessions(workspaceId),
        window.claudex.claude.rangement(workspaceId)
      ])
      set({
        sessions: { ...get().sessions, [workspaceId]: sessions },
        rangements: { ...get().rangements, [workspaceId]: rangement }
      })
    } finally {
      set({ sessionsEnCours: { ...get().sessionsEnCours, [workspaceId]: false } })
    }
  },

  ouvrirSession: async (workspaceId, intention, uuid, titre) => {
    // Une session déjà ouverte ne se dédouble pas : on bascule sur son onglet.
    if (intention === 'reprise' && uuid) {
      const existant = get().tabs.find((t) => t.claudeSessionId === uuid)
      if (existant) {
        set({ activeTabId: existant.id })
        apaiserOnglet(get, existant.id)
        return
      }
    }
    if (get().activeWorkspaceId !== workspaceId) await get().choisirWorkspace(workspaceId)
    const tab = await window.claudex.claude.ouvrir(workspaceId, intention, uuid, titre)
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
    void get().rafraichirComptes()
    apaiserOnglet(get, tab.id)
  },

  deroulerTout: (workspaceId) =>
    set({ toutAfficher: { ...get().toutAfficher, [workspaceId]: true } }),

  deplacerElement: async (workspaceId, quoi, cible) => {
    // Le premier geste fige l'ordre affiché : sans cela, la conversation
    // déplacée serait la seule rangée et le reste se réordonnerait derrière.
    const base = materialiser(
      get().sessions[workspaceId] ?? [],
      get().rangements[workspaceId] ?? RANGEMENT_VIDE
    )
    await enregistrerRangement(workspaceId, deplacer(base, quoi, cible), set, get)
  },

  ouvrirGroupe: async (workspaceId, index = 0, avec = []) => {
    const id = crypto.randomUUID()
    const base = materialiser(
      get().sessions[workspaceId] ?? [],
      get().rangements[workspaceId] ?? RANGEMENT_VIDE
    )
    await enregistrerRangement(workspaceId, creerGroupe(base, id, '', index, avec), set, get)
    set({ groupeANommer: id })
    return id
  },

  nommerGroupe: async (workspaceId, id, nom) => {
    const base = get().rangements[workspaceId] ?? RANGEMENT_VIDE
    set({ groupeANommer: undefined })
    await enregistrerRangement(
      workspaceId,
      renommerGroupe(base, id, nom.trim().slice(0, 60) || 'Groupe'),
      set,
      get
    )
  },

  finirNommage: () => set({ groupeANommer: undefined }),

  replierGroupeSessions: async (workspaceId, id, replie) => {
    const base = get().rangements[workspaceId] ?? RANGEMENT_VIDE
    await enregistrerRangement(workspaceId, replierGroupe(base, id, replie), set, get)
  },

  defaireGroupe: async (workspaceId, id) => {
    const base = get().rangements[workspaceId] ?? RANGEMENT_VIDE
    await enregistrerRangement(workspaceId, dissoudreGroupe(base, id), set, get)
  },

  /*
   * Les gestes du rail, sur le modèle de ceux des conversations.
   *
   * Chacun part de l'ordre affiché plutôt que du rangement seul : tant qu'on
   * n'a rien déplacé, celui-ci est vide, et un premier geste ferait sinon
   * sauter un projet au milieu d'une liste dont le reste n'est rangé nulle part.
   */
  ouvrirGroupeProjets: async (index = 0, avec = []) => {
    const id = crypto.randomUUID()
    const base = materialiser(get().workspaces, get().rangementProjets)
    await enregistrerRangementProjets(creerGroupe(base, id, '', index, avec), set, get)
    set({ groupeProjetANommer: id })
    return id
  },

  nommerGroupeProjets: async (id, nom) => {
    set({ groupeProjetANommer: undefined })
    await enregistrerRangementProjets(
      renommerGroupe(get().rangementProjets, id, nom.trim().slice(0, 60) || 'Groupe'),
      set,
      get
    )
  },

  replierGroupeProjets: async (id, replie) => {
    await enregistrerRangementProjets(replierGroupe(get().rangementProjets, id, replie), set, get)
  },

  defaireGroupeProjets: async (id) => {
    await enregistrerRangementProjets(dissoudreGroupe(get().rangementProjets, id), set, get)
  },

  deplacerProjet: async (quoi, cible) => {
    const base = materialiser(get().workspaces, get().rangementProjets)
    await enregistrerRangementProjets(deplacer(base, quoi, cible), set, get)
  },

  finirNommageProjet: () => set({ groupeProjetANommer: undefined }),

  choisirPanneau: (panneau) => set({ panneau }),

  demanderBifurcation: (workspaceId, uuid, titre) =>
    set({ bifurcationEnCours: { workspaceId, uuid, titre } }),

  etiqueter: async (workspaceId, uuid, texte) => {
    await window.claudex.claude.etiqueter(uuid, texte)
    await get().chargerSessions(workspaceId)
  },

  renommer: async (workspaceId, uuid, titre) => {
    await window.claudex.claude.nommer(uuid, titre)
    await get().chargerSessions(workspaceId)
  },

  basculerFavori: async (workspaceId, uuid, favori) => {
    await window.claudex.claude.favori(uuid, favori)
    await get().chargerSessions(workspaceId)
  },

  // Écarter une conversation demande confirmation : c'est parfois le seul
  // exemplaire d'un travail long.
  ecarterSession: async (workspaceId, session) => {
    set({ ecartEnCours: { workspaceId, session } })
  },

  annulerEcart: () => set({ ecartEnCours: undefined }),

  confirmerEcart: async () => {
    const demande = get().ecartEnCours
    if (!demande) return
    set({ ecartEnCours: undefined })

    // L'onglet qui la portait n'a plus d'objet une fois la conversation partie.
    const onglet = get().tabs.find((t) => t.claudeSessionId === demande.session.id)
    if (onglet) await get().fermerOnglet(onglet.id)

    await window.claudex.claude.ecarter(demande.workspaceId, demande.session.id)
    await get().chargerSessions(demande.workspaceId)
  },

  annulerBifurcation: () => set({ bifurcationEnCours: undefined }),

  confirmerBifurcation: async (nom) => {
    const demande = get().bifurcationEnCours
    if (!demande) return
    set({ bifurcationEnCours: undefined })
    await get().ouvrirSession(demande.workspaceId, 'bifurcation', demande.uuid, nom)
  },

  filtrer: (filtre) => set({ filtre }),

  rafraichirGit: async () => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) {
      set({ git: null })
      return
    }
    set({ git: await window.claudex.git.etat(workspaceId) })
  },

  chargerDossier: async (chemin) => {
    set({ lectureEnCours: [...get().lectureEnCours, chemin] })
    try {
      const entrees = await window.claudex.fs.lireDossier(chemin)
      set({ arbre: { ...get().arbre, [chemin]: entrees } })
    } catch {
      // Dossier disparu ou illisible : on l'oublie plutôt que de casser l'arbre.
      const arbre = { ...get().arbre }
      delete arbre[chemin]
      set({ arbre })
    } finally {
      set({ lectureEnCours: get().lectureEnCours.filter((c) => c !== chemin) })
    }
  },

  basculerDossier: async (chemin) => {
    const projet = get().activeWorkspaceId
    if (!projet) return
    const ouverts = get().dossiersOuverts[projet] ?? []
    const majOuverts = (liste: string[]): void =>
      set({ dossiersOuverts: { ...get().dossiersOuverts, [projet]: liste } })

    if (ouverts.includes(chemin)) {
      majOuverts(ouverts.filter((d) => d !== chemin))
      return
    }
    majOuverts([...ouverts, chemin])

    // Le contenu déjà lu s'affiche aussitôt, puis on le relit en arrière-plan :
    // le disque a pu bouger depuis, mais l'attente n'a pas à être visible.
    if (get().arbre[chemin]) void get().chargerDossier(chemin)
    else await get().chargerDossier(chemin)
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
    // Les deux séparateurs, parce que la clé vient du système de fichiers : sur
    // Windows les chemins sont en antislash, et ne comparer qu’à la barre
    // oblique ne relisait que la racine. Les dossiers dépliés en dessous
    // gardaient leur contenu d’avant, et « Relire l’arborescence » ne montrait
    // pas le fichier qu’on venait d’y déposer.
    const sousLaRacine = (d: string): boolean =>
      d.startsWith(`${racine}/`) || d.startsWith(`${racine}\\`)
    const aRelire = Object.keys(get().arbre).filter((d) => d === racine || sousLaRacine(d))
    await Promise.all(aRelire.map((d) => get().chargerDossier(d)))
  },

  nouvelOnglet: async () => {
    const workspaceId = get().activeWorkspaceId
    if (!workspaceId) return
    const tab = await window.claudex.term.create(workspaceId)
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
    void get().rafraichirComptes()
  },

  choisirOnglet: (id) => {
    set({ activeTabId: id, vueActive: undefined })
    // Le processus principal tient l'ordre des onglets par dernière visite :
    // sans ce mot, il ne saurait pas lequel on regarde.
    void window.claudex.term.focus(id)
    apaiserOnglet(get, id)
  },

  ongletVoisin: (pas) => {
    const cible = voisin(get().tabs, get().activeTabId, pas)
    if (cible && cible.id !== get().activeTabId) get().choisirOnglet(cible.id)
  },

  poserSollicitations: (sollicitations) => set({ sollicitations }),

  fermerOnglet: async (id) => {
    // Fermer l'onglet emporte sa session tmux, et l'agent avec elle : sa
    // demande n'a plus personne pour y répondre.
    const uuid = get().tabs.find((t) => t.id === id)?.claudeSessionId
    if (uuid && get().sollicitations[uuid]) void window.claudex.claude.apaiser(uuid)
    await window.claudex.term.close(id)
    const restants = get().tabs.filter((t) => t.id !== id)
    const retenu =
      get().activeTabId === id ? dernierRegarde(restants)?.id : get().activeTabId
    set({ tabs: restants, activeTabId: retenu })
    if (retenu) void window.claudex.term.focus(retenu)
    void get().rafraichirComptes()
  },

  fermerOnglets: async (ids) => {
    // L'un après l'autre : chaque fermeture détruit une session, et les mener
    // de front laisserait l'onglet regardé se décider au hasard des retours.
    for (const id of ids) await get().fermerOnglet(id)
  },

  enregistrerLayout: (layout) => {
    set({ layout: { ...get().layout, ...layout } })
    void window.claudex.state.setLayout(layout)
  },

  replier: (quoi) => {
    const layout = get().layout
    get().enregistrerLayout(
      quoi === 'rail'
        ? { railReplie: !layout.railReplie }
        : { colonneRepliee: !layout.colonneRepliee }
    )
  },

  ouvrirDiagnostic: (ouvert) => set({ diagnosticOuvert: ouvert }),

  relancerDiagnostic: async () => set({ diagnostics: await window.claudex.doctor.check() }),

  appliquerCorrectif: async (action) => {
    const resultat = await window.claudex.doctor.appliquer(action)
    set({ diagnostics: await window.claudex.doctor.check() })
    return resultat.message
  }
}))
