import { createConnection } from 'node:net'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { resoudre, vagues, type Declaration, type Reproche, type Service } from '@shared/services'
import type { EtatService, ServiceVu } from '@shared/types'
import { multiplexeur } from './multiplexeur'

/** Le fichier que lit Claudex, et le dossier où il verse les journaux. */
export const FICHIER = join('.claudex', 'services.yml')
const JOURNAUX = join('.claudex', 'logs')

/**
 * Au-delà, le journal bascule en `.log.1`.
 *
 * La trace du démarrage est ainsi conservée le temps d'un cycle, et c'est
 * souvent elle qui porte la pile d'erreur d'un service qui n'a pas voulu
 * partir. Un agent qui lirait deux cents mégaoctets ne s'en remettrait pas.
 */
const TAILLE_MAX = 10 * 1024 * 1024

/** Dimensions données à la session d'un service, que personne ne regarde. */
const COLONNES = 160
const LIGNES = 48

/**
 * Nom de session d'un service.
 *
 * Le préfixe le sépare des onglets, nommés `cdx_`. Un service n'est pas une
 * conversation : il ne doit jamais se retrouver dans la barre d'onglets, et
 * un nom distinct rend la confusion impossible plutôt qu'improbable.
 */
export function nomSession(workspaceId: string, service: string): string {
  const propre = (v: string): string => v.replace(/[^a-zA-Z0-9]/g, '')
  return `svc_${propre(workspaceId)}_${propre(service)}`
}

export function cheminJournal(projet: string, service: string): string {
  return join(projet, JOURNAUX, `${service}.log`)
}

/** Lit la déclaration du projet. Un projet sans fichier n'est pas une erreur. */
export async function charger(
  projet: string
): Promise<{ services: Service[]; reproches: Reproche[] }> {
  const texte = await readFile(join(projet, FICHIER), 'utf8').catch(() => null)
  if (texte === null) return { services: [], reproches: [] }

  let declaration: Declaration
  try {
    declaration = (parse(texte) ?? {}) as Declaration
  } catch (erreur) {
    return {
      services: [],
      reproches: [{ message: `Le fichier ne se lit pas : ${(erreur as Error).message}` }]
    }
  }

  const resolu = resoudre(declaration)
  return resolu
}

/** Vrai si quelque chose écoute sur ce port. */
function ecoute(port: number): Promise<boolean> {
  return new Promise((resoudre) => {
    const prise = createConnection({ host: '127.0.0.1', port })
    const conclure = (reponse: boolean): void => {
      prise.destroy()
      resoudre(reponse)
    }
    prise.setTimeout(400)
    prise.once('connect', () => conclure(true))
    prise.once('timeout', () => conclure(false))
    prise.once('error', () => conclure(false))
  })
}

/**
 * L'état d'un service.
 *
 * Il ne se lit pas sur le processus. `docker compose up -d` rend la main
 * aussitôt et les conteneurs tournent ; un service lancé hors de Claudex vit
 * sans que l'application ait de session pour lui. Le port fait donc foi quand
 * il y en a un, et la session ne dit que ce qu'elle sait : si Claudex l'a
 * lancé, et s'il tourne encore.
 */
export async function etat(
  workspaceId: string,
  service: Service
): Promise<{ etat: EtatService; notre: boolean }> {
  const notre = await multiplexeur.existe(nomSession(workspaceId, service.nom))
  const debout = service.port !== undefined ? await ecoute(service.port) : notre

  if (debout) return { etat: notre || !service.port ? 'vivant' : 'dehors', notre }
  // Une session qui vit sans que le port réponde est un service qui démarre,
  // ou qui a échoué sans rendre la main. Les distinguer demanderait de lire son
  // journal ; on dit « démarrage » et l'utilisateur ouvre la fenêtre.
  return { etat: notre ? 'demarrage' : 'arrete', notre }
}

export async function etats(workspaceId: string, projet: string): Promise<ServiceVu[]> {
  const { services, reproches } = await charger(projet)
  return Promise.all(
    services.map(async (service) => {
      const { etat: quel, notre } = await etat(workspaceId, service)
      return {
        nom: service.nom,
        groupe: service.groupe,
        port: service.port,
        detache: service.detache,
        depend_de: service.depend_de,
        etat: quel,
        notre,
        journal: cheminJournal(projet, service.nom),
        reproche: reproches.find((r) => r.service === service.nom)?.message
      }
    })
  )
}

/** Fait basculer le journal quand il a trop grossi. */
async function fairePlace(fichier: string): Promise<void> {
  const infos = await stat(fichier).catch(() => null)
  if (infos && infos.size > TAILLE_MAX) {
    await rename(fichier, `${fichier}.1`).catch(() => undefined)
  }
}

/**
 * Démarre un service, et met sa sortie dans un fichier.
 *
 * Le fichier est le même que celui qu'un agent lira. Une seule source, trois
 * lecteurs : la fenêtre de suivi, l'agent, et l'écran de la session si on
 * l'ouvre.
 */
export async function demarrer(
  workspaceId: string,
  projet: string,
  service: Service
): Promise<void> {
  const journal = cheminJournal(projet, service.nom)
  await mkdir(join(projet, JOURNAUX), { recursive: true })
  await fairePlace(journal)

  const session = nomSession(workspaceId, service.nom)
  const cwd = join(projet, service.dossier)
  // Le journal part avec l'amorce, non après : c'est le pilote qui sait
  // brancher le tuyau avant que la commande ne parte, et l'ordre inverse
  // perdrait la trace de démarrage.
  await multiplexeur.assurer(session, cwd, COLONNES, LIGNES, {
    commande: service.commande,
    env: service.env,
    journal
  })
}

export async function arreter(workspaceId: string, service: Service): Promise<void> {
  const session = nomSession(workspaceId, service.nom)
  await multiplexeur.journaliser(session, null).catch(() => undefined)
  await multiplexeur.detruire(session).catch(() => undefined)
}

/**
 * Démarre plusieurs services dans l'ordre de leurs dépendances.
 *
 * Chaque vague part d'un bloc, et l'on attend que ses ports répondent avant la
 * suivante. Sans cette attente, les dix services back partiraient avant que
 * Consul ne soit debout, et se déclareraient dans le vide.
 */
export async function demarrerPlusieurs(
  workspaceId: string,
  projet: string,
  noms: string[],
  attendre = 60_000
): Promise<{ bloques: string[] }> {
  const { services } = await charger(projet)
  const voulus = services.filter((s) => noms.includes(s.nom))
  const { ordre, bloques } = vagues(voulus)

  for (const vague of ordre) {
    await Promise.all(vague.map((service) => demarrer(workspaceId, projet, service)))
    const aAttendre = vague.filter((s) => s.port !== undefined)
    if (aAttendre.length === 0) continue

    const limite = Date.now() + attendre
    while (Date.now() < limite) {
      const prets = await Promise.all(aAttendre.map((s) => ecoute(s.port!)))
      if (prets.every(Boolean)) break
      await new Promise((suite) => setTimeout(suite, 500))
    }
  }

  return { bloques: bloques.map((s) => s.nom) }
}

/**
 * Écrit le skill qui dit aux agents où sont les journaux.
 *
 * Un fichier neuf plutôt qu'une ligne ajoutée au `CLAUDE.md` du projet : Claudex
 * ne modifie pas un fichier versionné que quelqu'un d'autre tient.
 */
export async function ecrireSkill(projet: string): Promise<string> {
  const { services } = await charger(projet)
  const dossier = join(projet, '.claude', 'skills', 'services-du-projet')
  await mkdir(dossier, { recursive: true })

  const lignes = services
    .map((s) => `- \`${s.nom}\`${s.port ? ` sur le port ${s.port}` : ''} : \`${JOURNAUX}/${s.nom}.log\``)
    .join('\n')

  const contenu = `---
name: services-du-projet
description: Les services de ce projet et leurs journaux. À lire avant de chercher pourquoi un appel échoue, avant de supposer qu'un service tourne, ou pour retrouver une trace d'erreur.
---

# Les services de ce projet

Claudex lance ces services et verse leur sortie dans des fichiers. Ils sont
déclarés dans \`${FICHIER}\`.

${lignes || '_Aucun service déclaré._'}

## Lire un journal

Le fichier porte la sortie brute, séquences de couleur comprises.

\`\`\`sh
tail -200 ${JOURNAUX}/<service>.log
grep -n "ERROR" ${JOURNAUX}/<service>.log | tail -40
\`\`\`

Ne pas le lire en entier : un service Java écrit vite, et le fichier bascule en
\`.log.1\` au-delà de dix mégaoctets. La fin du fichier porte ce qui vient de se
produire, le \`.log.1\` porte le démarrage précédent.

## Ce que ce skill ne permet pas

Démarrer ou arrêter un service. Ils sont pilotés depuis Claudex, et les relancer
à la main ferait tourner deux instances du même service.
`
  const chemin = join(dossier, 'SKILL.md')
  await writeFile(chemin, contenu)
  return chemin
}
