/**
 * La déclaration des services d'un projet, et ce qu'on en tire.
 *
 * Un service est un processus long qu'on lance depuis Claudex : une API, un
 * front, une infrastructure en conteneurs. Il n'est pas une conversation, et
 * n'entre donc jamais dans la barre d'onglets ; il vit à côté, dans une session
 * du multiplexeur que rien n'affiche tant qu'on ne la demande pas.
 *
 * Ce module ne touche ni au disque ni au système : il lit un texte et rend un
 * plan. C'est là que vivent les décisions, donc c'est là qu'on les éprouve.
 */

/** Ce qu'un service déclare, tel qu'il est écrit dans le fichier. */
export interface ServiceDeclare {
  nom: string
  /**
   * Le modèle dont ce service tient ses réglages.
   *
   * Séparé du groupe, qui ne dit que l'endroit où le service s'affiche. Sans
   * cette séparation, un front qui se lance autrement que ses voisins devait
   * former un groupe à lui seul, et la page en montrait deux là où il n'y a
   * qu'une famille.
   */
  modele?: string
  groupe?: string
  dossier?: string
  commande?: string
  port?: number
  sante?: string
  depend_de?: string[]
  env?: Record<string, string>
  /**
   * Vrai quand la commande rend la main sans que le service s'arrête.
   *
   * `docker compose up -d` en est le cas type. L'état ne peut alors pas se lire
   * sur le processus, qui est mort aussitôt : il se lit sur le port ou sur la
   * santé. Sans cette distinction, l'infrastructure apparaîtrait arrêtée alors
   * qu'elle tourne.
   */
  detache?: boolean
}

/** Un service une fois les défauts de son groupe appliqués. */
export interface Service extends ServiceDeclare {
  commande: string
  dossier: string
  depend_de: string[]
  detache: boolean
}

export interface Declaration {
  /**
   * Réglages nommés, dont un service hérite en les citant.
   *
   * Onze services Spring partagent la même commande et la même URL de santé,
   * au port près. Un modèle les porte une fois.
   */
  modeles?: Record<string, Partial<ServiceDeclare>>
  /**
   * Valeurs par défaut, par nom de groupe.
   *
   * La première façon de faire, gardée telle quelle : les fichiers écrits
   * avant les modèles marchent sans être repris. Un service qui cite un modèle
   * ne la consulte pas.
   */
  defaut?: Record<string, Partial<ServiceDeclare>>
  services?: ServiceDeclare[]
}

/** Ce qui empêche une déclaration d'être utilisable. */
export interface Reproche {
  service?: string
  message: string
}

const CHAMPS_HERITES = ['commande', 'dossier', 'sante', 'depend_de', 'env', 'detache'] as const

/**
 * Applique les défauts du groupe, et remplace `{port}` là où il apparaît.
 *
 * Onze services Spring partagent la même commande et la même URL de santé, au
 * port près. Les écrire onze fois donnerait un fichier illisible, et faux le
 * jour où le profil change.
 */
export function resoudre(declaration: Declaration): { services: Service[]; reproches: Reproche[] } {
  const reproches: Reproche[] = []
  const defauts = declaration.defaut ?? {}
  const modeles = declaration.modeles ?? {}
  const vus = new Set<string>()
  const services: Service[] = []

  for (const brut of declaration.services ?? []) {
    if (!brut.nom) {
      reproches.push({ message: 'Un service sans nom ne peut pas être désigné.' })
      continue
    }
    if (vus.has(brut.nom)) {
      reproches.push({ service: brut.nom, message: 'Deux services portent ce nom.' })
      continue
    }
    vus.add(brut.nom)

    // Le modèle cité prime sur le bloc du groupe : c'est lui qu'on a nommé.
    let defaut: Partial<ServiceDeclare> = {}
    if (brut.modele) {
      const modele = modeles[brut.modele]
      if (modele) defaut = modele
      else {
        reproches.push({
          service: brut.nom,
          message: `Le modèle « ${brut.modele} » n'est déclaré nulle part.`
        })
      }
    } else if (brut.groupe) {
      defaut = defauts[brut.groupe] ?? {}
    }
    const fusionne: ServiceDeclare = { ...brut }
    for (const champ of CHAMPS_HERITES) {
      if (fusionne[champ] === undefined && defaut[champ] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(fusionne as any)[champ] = defaut[champ]
      }
    }

    if (!fusionne.commande) {
      reproches.push({ service: brut.nom, message: 'Aucune commande, ni ici ni dans son groupe.' })
      continue
    }

    const port = fusionne.port
    const substituer = (valeur: string): string =>
      port === undefined ? valeur : valeur.replaceAll('{port}', String(port))

    if (fusionne.sante?.includes('{port}') && port === undefined) {
      reproches.push({
        service: brut.nom,
        message: 'Son URL de santé attend un port, qu’il ne déclare pas.'
      })
      continue
    }

    services.push({
      ...fusionne,
      commande: substituer(fusionne.commande),
      dossier: fusionne.dossier ?? '.',
      sante: fusionne.sante ? substituer(fusionne.sante) : undefined,
      depend_de: fusionne.depend_de ?? [],
      detache: fusionne.detache ?? false
    })
  }

  // Une dépendance qui ne désigne rien retiendrait le démarrage pour toujours.
  const noms = new Set(services.map((s) => s.nom))
  for (const service of services) {
    for (const attendu of service.depend_de) {
      if (!noms.has(attendu)) {
        reproches.push({
          service: service.nom,
          message: `Il attend « ${attendu} », qui n’est déclaré nulle part.`
        })
      }
    }
  }

  return { services, reproches }
}

/**
 * L'ordre de démarrage, par vagues.
 *
 * Chaque vague ne contient que des services dont les dépendances sont déjà
 * parties, et peut donc être lancée d'un bloc. Un cycle ne rend pas la main
 * dans le vide : ce qu'il retient est nommé, faute de quoi l'on chercherait
 * longtemps pourquoi trois services ne démarrent pas.
 */
export function vagues(services: Service[]): { ordre: Service[][]; bloques: Service[] } {
  const restants = new Map(services.map((s) => [s.nom, s]))
  const partis = new Set<string>()
  const ordre: Service[][] = []

  while (restants.size > 0) {
    const vague = [...restants.values()].filter((s) =>
      s.depend_de.every((d) => partis.has(d) || !restants.has(d))
    )
    if (vague.length === 0) break
    for (const service of vague) {
      partis.add(service.nom)
      restants.delete(service.nom)
    }
    ordre.push(vague)
  }

  return { ordre, bloques: [...restants.values()] }
}
