/**
 * Le prompt qui fait rédiger un message de commit.
 *
 * Ce qui marche n'est pas d'écrire les règles, c'est de montrer les derniers
 * commits du dépôt. La langue, le format, le ton et la longueur s'en déduisent
 * seuls, et cela vaut pour n'importe quel dépôt sans qu'on le configure. Un
 * dépôt qui écrit en anglais avec des titres de sept mots obtiendra cela.
 *
 * Rien ici n'appelle git ni Claude : les morceaux entrent, le texte sort.
 */

/** Ce qu'un dépôt apporte au prompt. */
export interface Apport {
  /** Le nom du dépôt, écrit quand il y en a plusieurs. */
  nom: string
  /** La sortie de `git diff --stat`, qui dit l'ampleur même si le diff est coupé. */
  stat: string
  /** Le diff lui-même, éventuellement tronqué. */
  diff: string
  tronque: boolean
}

/** Au-delà, le diff est coupé. Le `--stat` reste entier pour dire l'ampleur. */
export const DIFF_MAX = 60_000

/**
 * Coupe un diff trop long à une limite de ligne.
 *
 * Couper au milieu d'une ligne donnerait à lire un fragment qui ressemble à du
 * code sans en être.
 */
export function tronquer(diff: string, max = DIFF_MAX): { texte: string; tronque: boolean } {
  if (diff.length <= max) return { texte: diff, tronque: false }
  const coupe = diff.slice(0, max)
  const fin = coupe.lastIndexOf('\n')
  return { texte: coupe.slice(0, fin > 0 ? fin : coupe.length), tronque: true }
}

/**
 * Assemble le prompt.
 *
 * Les exemples viennent en premier : c'est le modèle à suivre, et ce qui vient
 * après n'est que la matière.
 */
export function construirePrompt(apports: Apport[], exemples: string[]): string {
  const morceaux: string[] = [
    'Rédige le message du commit qui va être écrit, à partir du diff ci-dessous.'
  ]

  if (exemples.length > 0) {
    morceaux.push(
      '',
      "# Les derniers commits de ce dépôt",
      '',
      "Suis leur langue, leur format, leur ton et leur longueur. C'est le style de",
      'ce dépôt, et le message que tu écris doit y ressembler à s’y méprendre.',
      '',
      exemples.map((e) => e.trim()).join('\n\n---\n\n')
    )
  }

  morceaux.push(
    '',
    '# Ce qui change',
    ...apports.flatMap((a) => [
      '',
      apports.length > 1 ? `## Dépôt ${a.nom}` : `## ${a.nom}`,
      '',
      '```',
      a.stat.trim(),
      '```',
      '',
      a.tronque
        ? '_Le diff qui suit est coupé. Le compte ci-dessus, lui, est entier._'
        : '',
      '```diff',
      a.diff.trim(),
      '```'
    ])
  )

  morceaux.push(
    '',
    '# Ce qu’on attend',
    '',
    "- Dis ce qui a été fait avant de dire pourquoi. On parcourt un journal pour",
    '  retrouver un changement, non pour suivre un raisonnement.',
    "- Parle de ce que le code fait maintenant, jamais de l’existence des fichiers.",
    apports.length > 1
      ? "- Un seul message pour les dépôts ci-dessus : c’est lui qui sera écrit dans chacun."
      : '',
    '- Rends le message seul. Pas d’explication autour, pas de bloc de code, pas de',
    '  guillemets qui l’enveloppent.'
  )

  return morceaux.filter((m) => m !== '').join('\n')
}

/**
 * Nettoie ce que l'agent a rendu.
 *
 * Il enveloppe parfois sa réponse d'un bloc de code malgré la consigne, ou
 * l'ouvre d'une phrase de politesse. Le champ doit recevoir le message, pas
 * son emballage.
 */
export function nettoyer(sortie: string): string {
  let texte = sortie.trim()

  // Un bloc de code qui entoure tout le message.
  const bloc = /^```[a-z]*\n([\s\S]*)\n```$/.exec(texte)
  if (bloc?.[1]) texte = bloc[1].trim()

  // Une phrase d'introduction suivie d'une ligne vide, quand la première ligne
  // ne ressemble pas à un titre de commit.
  const lignes = texte.split('\n')
  const premiere = lignes[0] ?? ''
  const ressembleAUnTitre = /^[a-z]+(\([^)]*\))?!?: /.test(premiere) || premiere.length <= 72
  if (!ressembleAUnTitre && lignes[1] === '') texte = lignes.slice(2).join('\n').trim()

  return texte
}
