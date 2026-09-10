import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Les deux listes des langages, de part et d'autre du pont.
 *
 * Le processus principal reconnaît une extension et nomme un langage ; le
 * renderer y attache un coloriseur. Elles ont divergé sans bruit : treize
 * langages sur dix-huit étaient reconnus mais affichés en gris.
 */
describe('langages reconnus et colorés', () => {
  /** Les langages que le processus principal sait nommer. */
  const detectes = (): string[] => {
    const source = readFileSync('src/main/services/fichiers.ts', 'utf8')
    const bloc = /const LANGAGES[\s\S]*?\n\}/.exec(source)?.[0] ?? ''
    return [...new Set([...bloc.matchAll(/: '([a-z]+)'/g)].map((m) => m[1]!))]
  }

  /** Ceux auxquels le renderer attache un coloriseur, ou qu'il admet sans. */
  const traites = (): { colores: string[]; admis: string[] } => {
    const source = readFileSync('src/renderer/src/components/files/FilePreview.tsx', 'utf8')
    const bloc = /function extensionLangage[\s\S]*?\n\}/.exec(source)?.[0] ?? ''
    const cas = [...bloc.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]!)
    // Ceux que le commentaire du `default` nomme sont admis sans coloriseur.
    const sans = [...bloc.matchAll(/Un (\w+) se lit|un (\w+) et un (\w+)/g)].flatMap((m) =>
      m.slice(1).filter(Boolean)
    )
    return { colores: cas, admis: sans.map((s) => s!.toLowerCase()) }
  }

  it('ne laisse aucun langage reconnu sans traitement', () => {
    const { colores, admis } = traites()
    const oublies = detectes().filter((l) => !colores.includes(l) && !admis.includes(l))

    // Un langage reconnu et non traité s'affiche en gris sans que rien ne le
    // dise : c'est ainsi que treize d'entre eux sont passés inaperçus.
    expect(oublies).toEqual([])
  })

  it('colore bien le YAML, le Java et le HTML', () => {
    // Ceux qu'on écrit tous les jours ici : une déclaration de services, un
    // service Spring, un gabarit Angular.
    const { colores } = traites()
    expect(colores).toEqual(expect.arrayContaining(['yaml', 'java', 'html']))
  })
})
