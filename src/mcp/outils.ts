/**
 * Les outils que Claudex offre aux agents.
 *
 * Ils vivent dans le processus de l'application, qui tourne déjà. Un serveur
 * lancé par conversation pesait quatre-vingt-huit mégaoctets : cinq
 * conversations en faisaient quatre cent quarante, contre cent quarante-neuf
 * pour Claudex tout entier. Le transport se branche par-dessus.
 *
 * Chaque outil prend le projet en paramètre, parce qu'un même serveur les
 * dessert tous. Sans lui, c'est celui qu'on regarde dans l'application.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { depots, diff, etatDepot } from '../main/services/git'
import {
  arreter,
  charger,
  demarrerPlusieurs,
  etats,
  lireJournal
} from '../main/services/projets-services'

/** Ce que le serveur doit savoir des projets ouverts dans Claudex. */
export interface Projets {
  /** Tous les projets, dans l'ordre du rail. */
  tous: () => { id: string; nom: string; chemin: string }[]
  /** Celui qu'on regarde, s'il y en a un. */
  actif: () => { id: string; nom: string; chemin: string } | undefined
}

/** Ce que rend un outil : du texte, que l'agent lit. */
const texte = (contenu: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: contenu }]
})

/** Le paramètre commun à tous les outils. */
const OU = {
  projet: z
    .string()
    .optional()
    .describe(
      'Le projet visé, par son nom ou son chemin. Sans lui, celui qu’on regarde dans Claudex.'
    )
}

/**
 * Monte les outils sur un serveur.
 *
 * Le serveur est rendu plutôt que gardé : chaque connexion a le sien, le
 * protocole associant un état de session à un transport.
 */
export function serveurDesOutils(projets: Projets): McpServer {
  const serveur = new McpServer({ name: 'claudex', version: '1.0.0' })

  /**
   * Le projet désigné, ou celui qu'on regarde.
   *
   * Le nom comme le chemin sont acceptés : un agent lit le premier dans la
   * réponse de `projets`, et connaît souvent le second par son dossier de
   * travail.
   */
  const viser = (
    dit?: string
  ): { id: string; nom: string; chemin: string } | { erreur: string } => {
    const tous = projets.tous()
    if (!dit) {
      const actif = projets.actif()
      if (actif) return actif
      return {
        erreur:
          tous.length === 0
            ? 'Claudex n’a aucun projet ouvert.'
            : `Aucun projet n’est regardé. Nomme-le : ${tous.map((p) => p.nom).join(', ')}.`
      }
    }

    const trouve = tous.find((p) => p.nom === dit || p.chemin === dit)
    if (trouve) return trouve
    // La liste peut être vide : dire « il y a : . » ferait une phrase qui
    // s'arrête au milieu, et l'agent le remarquerait avant l'utilisateur.
    return {
      erreur:
        tous.length === 0
          ? `Aucun projet nommé ${dit}, et Claudex n’en a aucun d’ouvert.`
          : `Aucun projet nommé ${dit}. Il y a : ${tous.map((p) => p.nom).join(', ')}.`
    }
  }

  serveur.registerTool(
    'projets',
    {
      title: 'Les projets ouverts dans Claudex',
      description:
        'Le nom et le chemin de chaque projet, et celui qu’on regarde. À appeler quand un autre ' +
        'outil dit ne pas savoir de quel projet il s’agit.',
      inputSchema: {}
    },
    async () => {
      const tous = projets.tous()
      if (tous.length === 0) return texte('Claudex n’a aucun projet ouvert.')
      const actif = projets.actif()
      return texte(
        tous
          .map((p) => `- ${p.nom}${p.id === actif?.id ? ' (regardé)' : ''} · ${p.chemin}`)
          .join('\n')
      )
    }
  )

  serveur.registerTool(
    'services',
    {
      title: 'Les services d’un projet',
      description:
        'L’état de chaque service déclaré : nom, port, marche ou non, groupe. À lire avant de ' +
        'supposer qu’un service tourne, et avant d’en lancer un à la main.',
      inputSchema: { ...OU }
    },
    async ({ projet }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const { services, reproches } = await charger(vise.chemin)
      if (services.length === 0) {
        return texte(
          reproches.length > 0
            ? `Aucun service lisible. ${reproches.map((r) => r.message).join(' ')}`
            : `${vise.nom} ne déclare aucun service.`
        )
      }

      const vus = await etats(vise.id, vise.chemin)
      return texte(
        vus
          .map((s) => {
            const morceaux = [`${s.nom} : ${s.etat}`]
            if (s.port !== undefined) morceaux.push(`port ${s.port}`)
            if (s.groupe) morceaux.push(`groupe ${s.groupe}`)
            if (s.reproche) morceaux.push(`⚠ ${s.reproche}`)
            morceaux.push(`journal ${s.journal}`)
            return `- ${morceaux.join(' · ')}`
          })
          .join('\n')
      )
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
        ...OU,
        service: z.string().describe('Le nom du service, tel que `services` le donne.'),
        lignes: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .default(200)
          .describe('Combien de lignes rendre.'),
        motif: z
          .string()
          .optional()
          .describe('Ne garder que les lignes qui contiennent ce texte, par exemple ERROR.')
      }
    },
    async ({ projet, service, lignes, motif }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const lu = await lireJournal(vise.chemin, service, { lignes, motif })
      if (lu === null) return texte(`Aucun service nommé ${service} dans ${vise.nom}.`)
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
        'Lance des services sous Claudex, dans l’ordre de leurs dépendances. Les lancer à la ' +
        'main ferait tourner deux instances du même service, hors de la vue de Claudex.',
      inputSchema: { ...OU, services: z.array(z.string()).min(1).describe('Les noms à lancer.') }
    },
    async ({ projet, services }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const { bloques } = await demarrerPlusieurs(vise.id, vise.chemin, services)
      const vus = await etats(vise.id, vise.chemin)
      const lignes = vus.filter((s) => services.includes(s.nom)).map((s) => `${s.nom} : ${s.etat}`)
      if (bloques.length > 0) {
        lignes.push(`Bloqués par leurs dépendances : ${bloques.join(', ')}.`)
      }
      return texte(lignes.join('\n') || 'Aucun de ces noms n’est déclaré.')
    }
  )

  serveur.registerTool(
    'arreter',
    {
      title: 'Arrêter des services',
      description: 'Détruit la session de chaque service nommé. Le journal reste sur le disque.',
      inputSchema: { ...OU, services: z.array(z.string()).min(1).describe('Les noms à arrêter.') }
    },
    async ({ projet, services }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const arretes = await arreterNommes(vise.id, vise.chemin, services)
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
      inputSchema: { ...OU, services: z.array(z.string()).min(1).describe('Les noms à relancer.') }
    },
    async ({ projet, services }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      await arreterNommes(vise.id, vise.chemin, services)
      await demarrerPlusieurs(vise.id, vise.chemin, services)
      const vus = await etats(vise.id, vise.chemin)
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
      title: 'Les dépôts git d’un projet',
      description:
        'Chaque dépôt, sa branche, son écart avec l’amont, et les fichiers qu’il porte de ' +
        'modifiés. Un projet peut en contenir seize.',
      inputSchema: { ...OU }
    },
    async ({ projet }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const { racines, reproches } = await depots(vise.chemin)
      if (racines.length === 0) {
        return texte(
          reproches.length > 0
            ? reproches.map((r) => `${r.chemin ?? ''} ${r.message}`.trim()).join('\n')
            : `${vise.nom} ne contient aucun dépôt git.`
        )
      }

      const lus = await Promise.all(racines.map(etatDepot))
      return texte(
        lus
          .filter(Boolean)
          .map((d) => {
            const tete = [`${d!.nom} · ${d!.branche || 'tête détachée'}`]
            if (d!.avance > 0) tete.push(`${d!.avance} à pousser`)
            if (d!.retard > 0) tete.push(`${d!.retard} à récupérer`)
            if (d!.fichiers.length === 0) return `- ${tete.join(' · ')} · rien à commiter`

            // La marque de la copie de travail, ou celle de l'index quand la
            // copie est au net. Dire « inchangé » d'un fichier déjà indexé le
            // ferait passer pour intact alors qu'il part au prochain commit.
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
          .join('\n')
      )
    }
  )

  serveur.registerTool(
    'diff',
    {
      title: 'Le diff d’un fichier',
      description:
        'Ce qui a changé dans un fichier, au format unifié. Le dépôt est celui que `depots` nomme.',
      inputSchema: {
        ...OU,
        depot: z.string().describe('Le nom du dépôt, tel que `depots` le donne.'),
        fichier: z.string().describe('Le chemin du fichier, relatif à la racine du dépôt.'),
        indexe: z
          .boolean()
          .default(false)
          .describe('Vrai pour comparer l’index à HEAD, faux pour comparer le travail à l’index.')
      }
    },
    async ({ projet, depot, fichier, indexe }) => {
      const vise = viser(projet)
      if ('erreur' in vise) return texte(vise.erreur)

      const { racines } = await depots(vise.chemin)
      // Le nom vient de l'agent : il doit désigner un dépôt du projet, non un
      // chemin quelconque du disque.
      const racine = racines.find((r) => r.endsWith(`/${depot}`) || r.endsWith(`\\${depot}`))
      if (!racine) return texte(`Aucun dépôt nommé ${depot} dans ${vise.nom}.`)

      const lu = await etatDepot(racine)
      const connu = lu?.fichiers.find((f) => f.chemin === fichier)
      const rendu = await diff(racine, fichier, {
        indexe,
        nonSuivi: connu?.travail === 'non-suivi'
      })

      if (rendu.trop) {
        return texte('Ce diff dépasse deux mégaoctets. Regarde le fichier directement.')
      }
      return texte(rendu.sortie.trim() || 'Aucune différence de ce côté.')
    }
  )

  return serveur
}

/**
 * Arrête les services nommés, et dit lesquels existaient.
 *
 * `arreter` prend le service déclaré et non son nom : c'est lui qui porte le
 * dossier et le port, dont dépend le nom de session.
 */
async function arreterNommes(
  workspaceId: string,
  projet: string,
  noms: string[]
): Promise<string[]> {
  const { services } = await charger(projet)
  const vises = services.filter((s) => noms.includes(s.nom))
  for (const service of vises) await arreter(workspaceId, service)
  return vises.map((s) => s.nom)
}
