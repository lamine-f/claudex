import { describe, expect, it } from 'vitest'
import { quand } from '../src/shared/temps'

describe('datation relative', () => {
  const minute = 60_000

  it("situe les dernières minutes en relatif", () => {
    expect(quand(Date.now() - 30_000)).toBe("à l'instant")
    expect(quand(Date.now() - 2 * minute)).toBe('il y a 2 min')
    expect(quand(Date.now() - 40 * minute)).toBe('il y a 40 min')
  })

  it("donne l'heure pour aujourd'hui et hier", () => {
    const tantot = new Date()
    tantot.setHours(9, 12, 0, 0)
    // Un test lancé avant 9h12 verrait un futur : on ne vérifie alors que la forme.
    const rendu = quand(tantot.getTime())
    expect(rendu === "aujourd'hui 09:12" || rendu.startsWith('il y a') || rendu === "à l'instant").toBe(
      true
    )

    const hier = new Date()
    hier.setDate(hier.getDate() - 1)
    hier.setHours(22, 5, 0, 0)
    expect(quand(hier.getTime())).toBe('hier 22:05')
  })

  it('retombe sur une date courte au-delà', () => {
    const vieux = new Date()
    vieux.setDate(vieux.getDate() - 6)
    expect(quand(vieux.getTime())).toMatch(/^\d{2}\/\d{2}$/)
  })
})
