<div align="center">
    <img src="docs/logo.png" width=200 height=200>
    <h1>Claudex</h1>
</div>

Claudex est un IDE de bureau dont l'unité de base n'est pas le fichier, mais la conversation
d'agent. On ouvre un projet, on voit toutes les conversations Claude Code qui ont eu lieu dans
ce dossier, on en choisit une. Un terminal la reprend exactement là où elle s'était arrêtée,
même après un redémarrage de la machine.

![Claudex en fonctionnement](docs/demo.gif)

[![Télécharger](https://img.shields.io/github/v/release/lamine-f/claudex?style=flat-square&label=t%C3%A9l%C3%A9charger&color=brightgreen)](https://github.com/lamine-f/claudex/releases/latest)
![Plateforme](https://img.shields.io/badge/plateformes-macOS%20%C2%B7%20Windows%20%C2%B7%20Debian-blue?style=flat-square)
![Prérequis](https://img.shields.io/badge/pr%C3%A9requis-Claude%20Code%20(%2B%20tmux%20hors%20Windows)-fa4e49?style=flat-square)
[![Licence](https://img.shields.io/github/license/lamine-f/claudex?style=flat-square)](LICENSE)

> [!NOTE]
> Claudex en est à sa première version publiée. Elle est utilisable au quotidien. Certaines
> fonctions restent à venir, la feuille de route plus bas dit lesquelles.

<details>
<summary>Sommaire</summary>

- [Installer sur macOS](#installer-sur-macos)
- [Installer sur Windows](#installer-sur-windows)
- [Installer sur Linux](#installer-sur-linux)
- [Fonctions et feuille de route](#fonctions-et-feuille-de-route)
- [Raccourcis](#raccourcis)
- [Comment ça tient debout](#comment-ça-tient-debout)
- [Les notifications, en détail](#les-notifications-en-détail)
- [Questions](#questions)
- [Développer](#développer)
- [Licence](#licence)

</details>

## Installer sur macOS

**1. Claude Code.** Claudex ne le remplace pas, il l'orchestre. Il faut donc l'avoir installé
et connecté. Suivre la [documentation officielle](https://docs.claude.com/en/docs/claude-code/setup),
puis lancer `claude` une fois dans un terminal pour s'authentifier.

**2. tmux.** Les terminaux de Claudex sont des sessions tmux. C'est ce qui leur permet de
survivre à la fermeture de l'application.

```sh
brew install tmux
```

Sans [Homebrew](https://brew.sh), voir le [dépôt de tmux](https://github.com/tmux/tmux/wiki/Installing).

**3. Claudex.** Prendre le fichier `.dmg` dans la
[dernière version publiée](https://github.com/lamine-f/claudex/releases/latest), l'ouvrir, et
glisser Claudex dans le dossier Applications.

**4. Le premier lancement.** L'application n'est pas notarisée par Apple, qui refusera de
l'ouvrir d'un double-clic. Faire **clic droit → Ouvrir**, puis confirmer. Une seule fois.

## Installer sur Windows

**1. Claude Code.** Claudex ne le remplace pas, il l'orchestre. Il faut donc l'avoir installé
et connecté. Suivre la [documentation officielle](https://docs.claude.com/en/docs/claude-code/setup),
puis lancer `claude` une fois dans un terminal pour s'authentifier.

**2. Claudex.** Rien d'autre à installer : les terminaux s'appuient sur ConPTY, qui fait partie
de Windows. Prendre l'installateur `.exe` dans la
[dernière version publiée](https://github.com/lamine-f/claudex/releases/latest). Il s'installe
pour l'utilisateur courant et ne demande pas de droits d'administrateur.

**3. Le premier lancement.** L'application n'est pas signée. SmartScreen affichera un
avertissement : **Informations complémentaires → Exécuter quand même**.

> [!IMPORTANT]
> Sur Windows, un terminal ne survit pas à la fermeture de Claudex. ConPTY n'a pas de serveur
> derrière lui, là où tmux en a un : la session est le processus, et elle meurt avec
> l'application. Les onglets, les conversations et l'écran de chaque terminal sont retrouvés au
> lancement suivant, mais ce qui tournait a été interrompu. Fermer Claudex pendant qu'un agent
> travaille l'arrête. L'écran d'état le rappelle.

Deux choses propres à cette plateforme. Les raccourcis prennent `Ctrl+Maj` au lieu de `⌘`, le
[tableau des raccourcis](#raccourcis) les donne tous. Et si l'écran d'état annonce Claude Code
introuvable alors qu'il est installé, c'est que `%USERPROFILE%\.local\bin` n'est pas encore
dans le PATH : son installateur ne l'y ajoute qu'à la session Windows suivante. Claudex sait
s'en passer pour ses propres terminaux, se déconnecter puis se reconnecter règle le reste.

## Installer sur Linux

Vérifié sur Debian 13 (trixie), GNOME sous Wayland, x86-64. Rien n'y est propre à Debian : une
autre distribution récente devrait convenir, elle n'a simplement pas été essayée.

**1. Claude Code.** Claudex ne le remplace pas, il l'orchestre. Il faut donc l'avoir installé
et connecté. Suivre la [documentation officielle](https://docs.claude.com/en/docs/claude-code/setup),
puis lancer `claude` une fois dans un terminal pour s'authentifier.

**2. tmux.** Les terminaux de Claudex sont des sessions tmux. C'est ce qui leur permet de
survivre à la fermeture de l'application.

```sh
sudo apt install tmux
```

**3. Claudex.** Deux formats au choix dans la
[dernière version publiée](https://github.com/lamine-f/claudex/releases/latest). Le paquet
Debian déclare tmux dans ses dépendances et l'installe avec l'application ; l'AppImage ne dépend
de rien et ne s'installe pas.

```sh
sudo apt install ./claudex_*_amd64.deb

# ou, sans installation
chmod +x Claudex-*.AppImage
./Claudex-*.AppImage
```

Les deux se refabriquent depuis les sources avec `npm run dist:linux`, et sortent dans `dist/`.

**4. Si la fenêtre ne s'ouvre pas.** Electron a besoin d'un bac à sable, qu'il prend dans les
espaces de noms utilisateur du noyau. Les distributions récentes les activent par défaut.

```sh
cat /proc/sys/kernel/unprivileged_userns_clone   # doit répondre 1
```

Si la valeur est `0`, ou si AppArmor restreint ces espaces de noms
(`/proc/sys/kernel/apparmor_restrict_unprivileged_userns` à `1`, cas d'Ubuntu 24.04), l'ouvrir
à Claudex vaut mieux que de lancer l'application avec `--no-sandbox`, qui la désarme
entièrement.

**5. Le gestionnaire de fichiers.** « Ouvrir dans le gestionnaire de fichiers » passe par
`xdg-open`. Le paquet Debian le réclame ; l'AppImage ne peut rien exiger, et l'écran d'état
signale son absence.

```sh
sudo apt install xdg-utils
```

## Fonctions et feuille de route

### Conversations

- [x] Lister les conversations du dossier exact, comme `/resume`
- [x] Les reprendre en un clic, avec tout leur contexte
- [x] Bifurquer pour explorer une piste sans toucher à l'originale
- [x] Renommer, étiqueter, mettre en favori, écarter vers une corbeille
- [x] Rattacher une conversation lancée à la main dans un terminal
- [ ] Archiver les transcrits en gzip avant que Claude Code ne les efface

### Rangement

- [x] Déplacer les conversations à la souris
- [x] Les réunir en groupes nommés, et déplacer les groupes
- [x] Filtrer sur le titre
- [x] Retrouver le classement au lancement suivant

### Terminaux

- [x] Sessions tmux persistantes, sur un socket dédié (macOS)
- [x] Un onglet par conversation, plusieurs onglets par projet
- [x] Reprise après un redémarrage de la machine
- [ ] Terminaux persistants sur Windows
- [ ] Découper un onglet en plusieurs volets

### Notifications

- [x] Signaler l'agent qui demande une permission ou pose une question
- [x] Notification du système quand la fenêtre n'a pas le focus
- [x] Installer et retirer les hooks depuis l'application
- [ ] Distinguer un agent interrompu d'un agent qui a fini

### Git

- [x] Suivre tous les dépôts d'un projet, y compris quand il en porte seize
- [x] Choisir lesquels dans `.claudex/git.yml`
- [x] Voir le diff d'un fichier, côte à côte ou d'un seul tenant
- [x] Commiter et pousser sur plusieurs dépôts à la fois
- [x] Faire rédiger le message du commit par un agent
- [ ] Le graphe des commits et le détail d'un commit
- [ ] Créer une branche, fusionner, résoudre les conflits

Un projet qui porte plusieurs dépôts les montre tous, rangés sous leur nom avec
leur branche. C'est le cas d'un dossier qui contient seize services, chacun
étant son propre dépôt.

Par défaut, Claudex cherche seul : le dossier du projet s'il est un dépôt, ses
enfants directs sinon. Pour sortir de cette règle, un fichier `.claudex/git.yml`
nomme les dépôts à suivre :

```yaml
depots:
  - olive_core
  - olive_gateway_service
  - sous/dossier/un_depot_plus_profond
  - ../web_clients/olive_front
```

Les chemins sont relatifs au projet et peuvent remonter d'un cran. Un chemin qui
ne mène à aucun dépôt est signalé en tête de la page plutôt qu'ignoré. Sans le
fichier, rien ne change.

Le bouton en forme d'étincelle, sous le champ de message, fait rédiger celui-ci
par un agent à partir des fichiers cochés. Il reçoit les derniers commits du
dépôt comme modèle : la langue, le format et le ton s'en déduisent, sans qu'on
les configure. L'agent n'écrit rien dans le dépôt, il remplit le champ, et un
message déjà écrit n'est pas remplacé sans qu'on le demande. Compter une demi-
minute. La commande appelée est `claude`, réglable par `CLAUDEX_CLAUDE`.

### Agents

- [x] Un skill écrit dans le projet, qui dit où sont les journaux
- [x] Un serveur MCP, pour qu'un agent pilote les services et lise l'état git
- [ ] Commiter depuis un agent

L'écran d'état porte le geste, sous « Agents branchés sur Claudex ». C'est un
réglage de l'application et non d'un projet : posé dans la barre d'un projet, il
laissait croire qu'il ne valait que pour lui. Toute conversation Claude Code
voit alors huit outils : les
projets ouverts, l'état des services, leur journal filtré, les démarrer, les
arrêter, les relancer, les dépôts git et le diff d'un fichier.

Le serveur vit dans le processus de Claudex, qui tourne déjà. Un serveur lancé
par conversation pesait quatre-vingt-huit mégaoctets : cinq conversations en
auraient fait quatre cent quarante, contre cent quarante-neuf pour Claudex tout
entier. Ici, le coût est nul.

Il n'écoute que la boucle locale et exige un jeton, sans quoi tout processus de
la machine pourrait piloter les services et lire le code des dépôts. Chaque
outil accepte le projet visé ; sans lui, c'est celui qu'on regarde.

Un agent qui relance un service à la main en ferait tourner deux, hors de la vue
de Claudex. C'est ce que le serveur évite.

### Projets et fichiers

- [x] Ajouter un projet, lui donner une couleur, passer de l'un à l'autre
- [x] Arborescence avec les icônes du type de fichier
- [x] Aperçu en lecture seule, coloré selon le langage
- [x] Écran d'état de l'environnement, avec ses correctifs
- [x] Windows
- [x] Linux, sur Debian

## Raccourcis

| macOS | Windows et Linux | |
|---|---|---|
| `⌘T` | `Ctrl+Maj+T` | nouveau terminal |
| `⌘W` | `Ctrl+Maj+W` | fermer l'onglet, et sa session avec lui |
| `⌘E` | `Ctrl+Maj+E` | passer d'une page de la colonne à la suivante : conversations, fichiers, git, services |
| `⌘1`…`⌘9` | `Ctrl+1`…`Ctrl+9` | passer d'un projet à l'autre |
| `Ctrl+Tab` | `Ctrl+Tab` | passer à l'onglet suivant, `Maj` pour le précédent |

La Majuscule n'est là que hors de macOS, où Commande est libre. Ailleurs il faut laisser
Contrôle au terminal : `Ctrl+E` va en fin de ligne, `Ctrl+W` efface le mot précédent, et une
application faite de terminaux ne peut pas les prendre à l'agent. Les chiffres s'en passent,
le shell ne les revendiquant pas.

## Comment ça tient debout

**Un pilote de terminal par plateforme.** Le reste de l'application ne connaît qu'une interface,
`src/main/services/multiplexeur/`, et ignore ce qu'il y a derrière.

Sur macOS, c'est **tmux, sur un socket dédié**. Toutes les commandes passent par
`tmux -L claudex`. Vos sessions personnelles ne sont ni touchées ni polluées. Un onglet vaut une
session tmux. Fermer l'application détache les clients, ce qui tournait tourne encore.

Sur Windows, c'est **ConPTY**, sans serveur derrière. La session est le processus, et elle meurt
avec l'application. C'est le seul endroit où la promesse de Claudex n'est pas tenue de la même
façon, et l'écran d'état le dit.

**Le dossier des transcrits.** Claude Code range les conversations d'un dossier dans
`~/.claude/projects/<chemin encodé>/`, où l'encodage remplace tout caractère non alphanumérique
par un tiret. Claudex ne l'emploie que dans ce sens, du projet vers le dossier. La
transformation n'est pas réversible.

**Les en-têtes, lus en flux.** Un transcrit peut peser plus de cent mégaoctets. La lecture
s'arrête dès qu'elle tient le titre, la branche et la date. Le plafond est de 200 lignes ou
256 Ko.

**Rien n'est effacé.** Écarter une conversation la déplace dans une corbeille propre à Claudex.
Le transcrit reste récupérable. L'écran d'état propose aussi de porter la rétention de Claude
Code à 365 jours. Par défaut, il efface les conversations au bout de 30, et elles ne sont alors
plus reprenables.

## Les notifications, en détail

Les activer ajoute trois hooks à `~/.claude/settings.json`. `Notification` allume le voyant,
`UserPromptSubmit` et `Stop` l'éteignent. Ils appellent un script déposé dans
`~/.claude/claudex/`. Une sauvegarde `.bak` est faite avant l'écriture, et vos propres hooks ne
sont pas touchés. Ils sont complétés, jamais remplacés.

Le script n'écrit rien quand Claudex ne tourne pas. Et l'application ne réagit qu'aux
conversations dont elle a l'onglet. Le hook est posé pour toute la machine, mais les terminaux
qu'elle ne connaît pas ne déclenchent rien.

Le même écran propose de les retirer. Le script est alors effacé et la configuration rendue à
son état d'origine.

## Questions

**Et Linux ?**
Rien ne s'y oppose : le pilote tmux y fonctionnerait tel quel, il manque une cible
d'empaquetage et quelqu'un pour l'éprouver.

**Est-ce que Claudex remplace Claude Code ?**
Non. Il faut le CLI installé et connecté. Claudex lui donne des projets, des onglets qui
survivent, et la mémoire de quelle conversation appartient à quel onglet.

**Mes conversations existantes sont-elles visibles ?**
Oui. Claudex lit ce que Claude Code a déjà écrit. Ajoutez un dossier où vous avez travaillé,
ses conversations apparaissent aussitôt.

**Que devient une session quand je ferme l'application ?**
Sur macOS et sur Linux, elle continue de tourner : les clients tmux se détachent, rien n'est
tué. Sur Windows, elle s'arrête, comme le dit
[Installer sur Windows](#installer-sur-windows). Dans les deux cas, fermer un onglet dans
l'application ferme sa session pour de bon.

## Développer

Le code, la structure, les tests et l'empaquetage : voir [DEVELOPPEMENT.md](DEVELOPPEMENT.md).

## Licence

Claudex est disponible sous [licence MIT](LICENSE).
