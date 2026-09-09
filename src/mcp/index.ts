/**
 * Le serveur MCP de Claudex.
 *
 * Il ne parle jamais à l'application. Un service est une session du
 * multiplexeur, nommée de façon déterministe à partir du projet et du service :
 * ce serveur lit la même déclaration, calcule le même nom, interroge le même
 * multiplexeur. Rien n'est dupliqué, et rien n'a besoin d'être joint.
 *
 * Cela évite un serveur réseau dans Claudex, un port à choisir, une
 * authentification à écrire et une surface à défendre. Cela a un second effet,
 * souhaitable : les outils répondent même quand Claudex n'est pas lancé.
 *
 * Lancé par Claude Code comme un processus à part, il parle sur l'entrée et la
 * sortie standard. Rien ne doit donc s'écrire sur la sortie en dehors du
 * protocole.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { depots, diff, etatDepot } from '../main/services/git'
import {
  arreter,
  charger,
  demarrerPlusieurs,
  etats,
  lireJournal
} from '../main/services/projets-services'
import { identifiantDuProjet } from './projet'

/** Le projet sur lequel le serveur travaille, dit à son lancement. */
function projetDemande(): string {
  const rang = process.argv.indexOf('--projet')
  const chemin = rang >= 0 ? process.argv[rang + 1] : undefined
  if (!chemin) {
    // Sur la sortie d'erreur : la sortie standard porte le protocole, et un
    // mot posé dessus rendrait le serveur illisible.
    process.stderr.write('Le serveur attend `--projet <chemin>`.\n')
    process.exit(2)
  }
  return chemin
}

const PROJET = projetDemande()

/**
 * L'identifiant que Claudex donne à ce projet.
 *
 * Le nom de session d'un service en dépend : sans lui, ce serveur en
 * calculerait un autre que l'application, et ne verrait aucun service tourner.
 * Il est lu une fois, au démarrage.
 */
const IDENTIFIANT = await identifiantDuProjet(PROJET)

/** Ce qu'on répond quand le projet n'est pas connu de Claudex. */
const INCONNU =
  'Ce dossier n’est pas un projet de Claudex. Ajoute-le dans l’application, ' +
  'puis relance cette conversation.'

/** Ce que rend un outil : du texte, que l'agent lit. */
const texte = (contenu: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: contenu }]
})

const serveur = new McpServer({ name: 'claudex', version: '1.0.0' })

serveur.registerTool(
  'services',
  {
    title: 'Les services du projet',
    description:
      'L’état de chaque service déclaré : nom, port, marche ou non, groupe, dépendances. ' +
      'À lire avant de supposer qu’un service tourne, et avant d’en lancer un à la main.',
    inputSchema: {}
  },
  async () => {
    if (!IDENTIFIANT) return texte(INCONNU)
    const { services, reproches } = await charger(PROJET)
    if (services.length === 0) {
      return texte(
        reproches.length > 0
          ? `Aucun service lisible. ${reproches.map((r) => r.message).join(' ')}`
          : 'Ce projet ne déclare aucun service.'
      )
    }

    const vus = await etats(IDENTIFIANT, PROJET)
    const lignes = vus.map((s) => {
      const morceaux = [`${s.nom} : ${s.etat}`]
      if (s.port !== undefined) morceaux.push(`port ${s.port}`)
      if (s.groupe) morceaux.push(`groupe ${s.groupe}`)
      if (s.reproche) morceaux.push(`⚠ ${s.reproche}`)
      morceaux.push(`journal ${s.journal}`)
      return `- ${morceaux.join(' · ')}`
    })
    return texte(lignes.join('\n'))
  }
)

serveur.registerTool(
  'journal',
  {
    title: 'La sortie d’un service',
    description:
      'Les dernières lignes du journal d’un service, filtrées. Préférer cet outil à la lecture ' +
      'du fichier : un service Java écrit vite, et le fichier atteint des dizaines de mégaoctets.',
    inputSchema: {
      service: z.string().describe('Le nom du service, tel que `services` le donne.'),
      lignes: z.number().int().min(1).max(2000).default(200).describe('Combien de lignes rendre.'),
      motif: z
        .string()
        .optional()
        .describe('Ne garder que les lignes qui contiennent ce texte, par exemple ERROR.')
    }
  },
  async ({ service, lignes, motif }) => {
    const lu = await lireJournal(PROJET, service, { lignes, motif })
    if (lu === null) return texte(`Aucun service nommé ${service} dans ce projet.`)
    if (!lu.trim()) {
      return texte(
        motif
          ? `Rien dans le journal de ${service} ne contient « ${motif} ».`
          : `Le journal de ${service} est vide. Le service n’a peut-être jamais démarré.`
      )
    }
    return texte(lu)
  }
)

serveur.registerTool(
  'demarrer',
  {
    title: 'Démarrer des services',
    description:
      'Lance des services sous Claudex, dans l’ordre de leurs dépendances. Les lancer à la main ' +
      'ferait tourner deux instances du même service, hors de la vue de Claudex.',
    inputSchema: {
      services: z.array(z.string()).min(1).describe('Les noms à lancer.')
    }
  },
  async ({ services }) => {
    if (!IDENTIFIANT) return texte(INCONNU)
    const { bloques } = await demarrerPlusieurs(IDENTIFIANT, PROJET, services)
    const vus = await etats(IDENTIFIANT, PROJET)
    const lignes = vus
      .filter((s) => services.includes(s.nom))
      .map((s) => `${s.nom} : ${s.etat}`)
    if (bloques.length > 0) {
      lignes.push(`Bloqués par leurs dépendances : ${bloques.join(', ')}.`)
    }
    return texte(lignes.join('\n') || 'Rien à lancer.')
  }
)

serveur.registerTool(
  'arreter',
  {
    title: 'Arrêter des services',
    description: 'Détruit la session de chaque service nommé. Le journal reste sur le disque.',
    inputSchema: {
      services: z.array(z.string()).min(1).describe('Les noms à arrêter.')
    }
  },
  async ({ services }) => {
    if (!IDENTIFIANT) return texte(INCONNU)
    const arretes = await arreterNommes(services)
    return texte(
      arretes.length > 0 ? `Arrêtés : ${arretes.join(', ')}.` : 'Aucun de ces noms n’est déclaré.'
    )
  }
)

serveur.registerTool(
  'relancer',
  {
    title: 'Relancer des services',
    description:
      'Arrête puis redémarre, pour reprendre un code qui a changé. Le geste à faire après une ' +
      'correction, avant de regarder le journal.',
    inputSchema: {
      services: z.array(z.string()).min(1).describe('Les noms à relancer.')
    }
  },
  async ({ services }) => {
    if (!IDENTIFIANT) return texte(INCONNU)
    await arreterNommes(services)
    await demarrerPlusieurs(IDENTIFIANT, PROJET, services)
    const vus = await etats(IDENTIFIANT, PROJET)
    return texte(
      vus
        .filter((s) => services.includes(s.nom))
        .map((s) => `${s.nom} : ${s.etat}`)
        .join('\n') || 'Aucun de ces noms n’est déclaré.'
    )
  }
)

serveur.registerTool(
  'depots',
  {
    title: 'Les dépôts git du projet',
    description:
      'Chaque dépôt du projet, sa branche, son écart avec l’amont, et les fichiers qu’il porte de ' +
      'modifiés. Un projet peut en contenir seize.',
    inputSchema: {}
  },
  async () => {
    const { racines, reproches } = await depots(PROJET)
    if (racines.length === 0) {
      return texte(
        reproches.length > 0
          ? reproches.map((r) => `${r.chemin ?? ''} ${r.message}`.trim()).join('\n')
          : 'Ce projet ne contient aucun dépôt git.'
      )
    }

    const lus = await Promise.all(racines.map(etatDepot))
    const lignes = lus.filter(Boolean).map((d) => {
      const tete = [`${d!.nom} · ${d!.branche || 'tête détachée'}`]
      if (d!.avance > 0) tete.push(`${d!.avance} à pousser`)
      if (d!.retard > 0) tete.push(`${d!.retard} à récupérer`)
      if (d!.fichiers.length === 0) return `- ${tete.join(' · ')} · rien à commiter`

      // La marque de la copie de travail, ou celle de l'index quand la copie est
      // au net. Dire « inchange » d'un fichier déjà indexé le ferait passer
      // pour intact alors qu'il part au prochain commit.
      const fichiers = d!.fichiers
        .map((f) => {
          const marque = f.travail === 'inchange' ? f.index : f.travail
          const dit = marque === 'non-suivi' ? 'neuf' : marque
          const cote = f.travail === 'inchange' ? ' (indexé)' : ''
          return `    ${dit}${cote} ${f.chemin}${f.ancien ? ` (avant ${f.ancien})` : ''}`
        })
        .join('\n')
      return `- ${tete.join(' · ')}\n${fichiers}`
    })
    return texte(lignes.join('\n'))
  }
)

serveur.registerTool(
  'diff',
  {
    title: 'Le diff d’un fichier',
    description:
      'Ce qui a changé dans un fichier, au format unifié. Le dépôt est celui que `depots` nomme.',
    inputSchema: {
      depot: z.string().describe('Le nom du dépôt, tel que `depots` le donne.'),
      fichier: z.string().describe('Le chemin du fichier, relatif à la racine du dépôt.'),
      indexe: z
        .boolean()
        .default(false)
        .describe('Vrai pour comparer l’index à HEAD, faux pour comparer le travail à l’index.')
    }
  },
  async ({ depot, fichier, indexe }) => {
    const { racines } = await depots(PROJET)
    // Le nom vient de l'agent : il doit désigner un dépôt du projet, non un
    // chemin quelconque du disque.
    const racine = racines.find((r) => r.endsWith(`/${depot}`) || r.endsWith(`\\${depot}`))
    if (!racine) return texte(`Aucun dépôt nommé ${depot} dans ce projet.`)

    const lu = await etatDepot(racine)
    const connu = lu?.fichiers.find((f) => f.chemin === fichier)
    const rendu = await diff(racine, fichier, {
      indexe,
      nonSuivi: connu?.travail === 'non-suivi'
    })

    if (rendu.trop) return texte('Ce diff dépasse deux mégaoctets. Regarde le fichier directement.')
    return texte(rendu.sortie.trim() || 'Aucune différence de ce côté.')
  }
)

/**
 * Arrête les services nommés, et dit lesquels existaient.
 *
 * `arreter` prend le service déclaré et non son nom : c'est lui qui porte le
 * dossier et le port, dont dépend le nom de session.
 */
async function arreterNommes(noms: string[]): Promise<string[]> {
  const { services } = await charger(PROJET)
  const vises = services.filter((s) => noms.includes(s.nom))
  for (const service of vises) await arreter(IDENTIFIANT!, service)
  return vises.map((s) => s.nom)
}

await serveur.connect(new StdioServerTransport())
