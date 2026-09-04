# Claudex

Un IDE de bureau dont l'unité de base n'est pas le fichier, mais la **conversation d'agent**.

On ouvre un projet, on voit toutes les conversations Claude Code qui ont eu lieu dans ce
dossier, on en choisit une : un terminal la reprend exactement là où elle s'était arrêtée.
Y compris après un redémarrage de la machine.

![Claudex](docs/claudex.png)

## D'où ça vient

Les terminaux modernes savent lister des sessions, mais ils ne connaissent pas la notion de
projet, et rien n'y survit vraiment à un reboot. Claude Code, lui, sait reprendre une
conversation — mais il ne sait pas laquelle appartient à quel onglet : son sélecteur oblige à
choisir à la main, à chaque terminal, à chaque redémarrage.

Claudex mémorise l'association *onglet → conversation* et rejoue `claude -r <uuid>` tout seul.
C'est là qu'est la valeur, pas dans une liste de plus.

## Ce qu'il fait

- **Projets** ajoutés à la main, chacun avec sa couleur, reprise du rail jusqu'aux onglets.
- **Conversations du dossier exact**, comme `/resume` : un dossier parent ne remonte pas
  celles de ses sous-projets. Titre, branche git, date, étiquette, favori.
- **Reprise en un clic** dans un nouvel onglet, **bifurcation** (`--fork-session`) pour
  explorer deux pistes depuis un même contexte sans toucher à l'originale.
- **Rangement à la main** : on déplace les conversations, on les réunit en groupes nommés,
  on déplace les groupes. Le classement se garde d'une session à l'autre.
- **Notifications** quand un agent demande une permission ou pose une question — une main
  levée dans la colonne, sur l'onglet, sur le projet, et une notification du système quand
  la fenêtre n'a pas le focus.
- **Terminaux persistants** adossés à tmux : fermer l'application ne tue rien.
- **Explorateur de fichiers** avec aperçu en lecture seule.

## Comment ça tient debout

**tmux, sur un socket dédié.** Toutes les commandes passent par `tmux -L claudex` : les
sessions personnelles ne sont ni touchées ni polluées. Un onglet = une session tmux = un
`xterm`. Fermer l'application détache les clients ; ce qui tournait tourne encore.

**Le dossier des transcrits.** Claude Code range les conversations d'un dossier dans
`~/.claude/projects/<chemin encodé>/`, où l'encodage remplace tout caractère non
alphanumérique par un tiret. La transformation est à sens unique : Claudex ne l'emploie que
dans le sens projet → dossier, jamais l'inverse.

**Les en-têtes, lus en flux.** Un transcrit peut peser plus de cent mégaoctets. La lecture
s'arrête dès qu'elle tient le titre, la branche et la date — plafond de 200 lignes ou 256 Ko.

**Les hooks.** Trois hooks facultatifs, posés depuis l'écran d'état de l'application :
`Notification` allume le voyant, `UserPromptSubmit` et `Stop` l'éteignent. Ils appellent un
script qui n'écrit rien quand Claudex ne tourne pas, et l'application ne réagit qu'aux
conversations dont elle a l'onglet.

## Prérequis

macOS (Apple Silicon), [tmux](https://github.com/tmux/tmux), le CLI
[Claude Code](https://claude.com/claude-code), et Node 22 ou plus.

## Lancer

```sh
npm install
npm run dev
```

Empaqueter une application installable :

```sh
npm run dist        # dist/Claudex-<version>-arm64.dmg
```

## Tests

```sh
npm test            # unitaires et intégration (vitest)
npm run test:e2e    # bout en bout, sur l'application réelle (playwright)
```

Les tests de bout en bout lancent Claudex sur un profil jetable et un serveur tmux à part
(`claudex-test`) : ils ne touchent ni à l'état ni aux sessions de l'application ouverte à côté.

## Signature sur macOS

Sans signature valide, macOS refuse les notifications à une application — sans rien dire.
Le paquet est donc signé en ad hoc à l'empaquetage, et l'Electron de développement après
chaque installation de dépendances. Une signature ad hoc ne prouve aucune provenance : elle
donne seulement au paquet une identité de code cohérente, ce que le système exige avant de
laisser notifier. Au premier lancement, macOS demandera confirmation, comme pour toute
application locale non notarisée.

## Licence

MIT.
