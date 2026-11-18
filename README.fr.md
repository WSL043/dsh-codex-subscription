<p align="center"><img src="icon-subscription.webp" width="128" height="128" alt="Icône de l’abonnement Codex pour DSH"></p>

<div align="center">

# DSH Codex Subscription

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

**Utilisez votre abonnement ChatGPT / Codex directement dans DeepSeek Harness**

Connectez-vous avec ChatGPT Plus / Pro pour utiliser GPT-6 et d’autres modèles Codex, le quota, la recherche sur le Web et la génération d’images dans DSH. Aucune clé API OpenAI ni CLI Codex requise.

[![CI](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml/badge.svg)](https://github.com/WSL043/dsh-codex-subscription/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-codex-subscription?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-codex-subscription)
[![total npm downloads](https://img.shields.io/npm/dt/dsh-codex-subscription?logo=npm&label=total%20downloads)](https://www.npmjs.com/package/dsh-codex-subscription)
[![MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Star](https://img.shields.io/github/stars/WSL043/dsh-codex-subscription?style=flat&logo=github&label=Star)](https://github.com/WSL043/dsh-codex-subscription/stargazers)

[Points forts](#highlights) · [Installation](#install) · [Images et croquis](#images-and-sketching) · [Contrôle à distance par téléphone](#phone-remote-control-beta) · [Toutes les fonctionnalités](#all-features) · [Guide utilisateur (en anglais)](docs/GUIDE.en.md) · [Dépannage](#troubleshooting) · [Agent](#agent-reference)

</div>

<a id="highlights"></a>

## Points forts

| Ce que vous voulez faire | Ce que le plugin propose |
| --- | --- |
| **Discuter et rechercher** | Connectez-vous avec votre abonnement ; choisissez les modèles Codex, les niveaux de raisonnement et de vitesse proposés par votre compte ; utilisez la recherche Web de l’abonnement. |
| **Gérer les comptes et le quota** | Changez de compte, consultez le quota à court terme et hebdomadaire, les crédits et les réinitialisations ; consultez l’historique d’utilisation et, en option, les alertes de quota dans la zone de rédaction. |
| **Créer et modifier des images** | Générez des images, marquez des zones à modifier ou dessinez manuellement et avec l’Agent sur un tableau de croquis modifiable. [Exemples →](#images-and-sketching) |
| **Continuer depuis votre téléphone** | Associez l’application mobile ChatGPT pour contrôler le DSH de cet ordinateur. DeepSeek et les autres modèles DSH fonctionnent aussi. [Bêta, désactivée par défaut →](#phone-remote-control-beta) |
| **Utiliser les applications connectées** | Permettez aux modèles DSH d’utiliser les applications connectées dans ChatGPT, notamment GitHub, Gmail, Drive et Calendar ; l’autorisation d’écriture dépend des droits de la session DSH. |

Les modèles et le quota dépendent des informations renvoyées par votre compte. [Liste complète des fonctionnalités →](#all-features)

<a id="prepare-dsh"></a>

## Préparer DSH

Utilisez une [version officielle de DSH](https://github.com/deepseek-ai/deepseek-harness/releases) compatible. Chaque version de l’extension est testée avec les canaux `latest` et `next` de DSH sur npm. Les versions compatibles figurent sous `engines.dsh` dans le [manifeste du paquet](package.json).

Consultez le [guide officiel de DSH](https://github.com/deepseek-ai/deepseek-harness#run) pour les prérequis Node.js de la CLI et de l’interface Web. DSH Desktop inclut son environnement d’exécution. L’extension nécessite un compte ChatGPT avec accès à Codex.

<details>
<summary>Choisir une distribution DSH</summary>

- **Recommandé : l’application de bureau officielle.** DeepSeek propose désormais une [application de bureau DeepSeek Harness](https://www.deepseek.com/harness/) (macOS sur Apple Silicon et Windows 64 bits ; préversion, open source). Aucune configuration de Node.js n’est nécessaire : installez-la, puis ajoutez ce plugin depuis la page Plugins comme indiqué ci-dessous. L’application de bureau, l’application Web et la CLI partagent un même système de plugins DSH ; les tests d’acceptation de bout en bout de ce plugin sont principalement réalisés sur l’application Web. Veuillez donc [signaler un problème](https://github.com/WSL043/dsh-codex-subscription/issues) si l’application de bureau ne fonctionne pas correctement.
- Besoin de Linux ou envie d’utiliser une version portable communautaire ? Utilisez [DSH-Portable](https://github.com/WSL043/DSH-Portable), une distribution de bureau portable communautaire pour Windows, macOS et Linux.
- Vous préférez la voie officielle ? Suivez le [guide d’exécution DeepSeek Harness (en anglais)](https://github.com/deepseek-ai/deepseek-harness#run).

</details>

<a id="install"></a>

## Installation

<a id="install-from-the-plugins-page-recommended"></a>

### Installer depuis la page Plugins (recommandé)

1. Dans DSH, ouvrez **Plugins → Ajouter un plugin**.
2. Collez ce nom de package, avec sa version, dans le champ **Nom ou adresse du package** :

   ```text
   dsh-codex-subscription@3.2.23
   ```

3. Cliquez sur **Installer** et attendez la fin de l’installation. Suivez les instructions de la page ; enregistrez votre travail avant de redémarrer si cela vous est demandé.
4. Ouvrez **Paramètres → Codex**, connectez-vous à ChatGPT, puis sélectionnez un modèle Codex dans votre conversation.

<details>
<summary>Pourquoi inclure la version ?</summary>

Pourquoi inclure la version : la page des plugins de DSH n’installe que des versions publiées depuis au moins 24 heures. Ainsi, pendant le premier jour suivant une nouvelle publication, le nom du package sans version peut installer une ancienne version, qui risque de ne pas prendre en charge votre version de DSH. En précisant la version, vous obtenez exactement cette version ; un jour après sa publication, `dsh-codex-subscription` sans version désigne également la dernière version stable. Les autres numéros de version sont indiqués sur la [page des versions](https://github.com/WSL043/dsh-codex-subscription/releases).

</details>

<details>
<summary>Installation dans le terminal (avec une commande dsh déjà installée)</summary>

```sh
dsh plugin --profile web add dsh-codex-subscription@3.2.23
```

Suivez les instructions de redémarrage, puis connectez-vous dans **Paramètres → Codex**. La page Plugins et le terminal utilisent tous deux le système de gestion des installations de DSH.

</details>

<details>
<summary>Tâches sans interface graphique</summary>

Après vous être connecté et avoir sélectionné un modèle Codex dans Web, installez le même plugin dans le profil Headless :

```sh
dsh plugin --profile headless add dsh-codex-subscription@3.2.23
dsh --profile headless "Reply with only the word: ok"
```

</details>

<a id="interface-demo"></a>

## Démonstration de l’interface

Connectez votre compte ChatGPT, choisissez un modèle Codex dans DSH et consultez le quota de votre abonnement dans les paramètres.

<details>
<summary>Se connecter et consulter le quota</summary>

Dans **Paramètres → Codex → Démarrage**, choisissez **Connexion par navigateur**. Après connexion, la même page affiche les comptes enregistrés, le quota et les heures de réinitialisation.

<p align="center"><img src="docs/assets/interface-account-fr.png" width="705" alt="Connexion par navigateur"></p>

</details>

<details>
<summary>Choisir un modèle Codex et envoyer un message</summary>

Une fois connecté, réglez le modèle et le niveau de raisonnement par défaut dans **Paramètres → Codex → Modèles**. Le sélecteur à côté du champ de saisie règle le modèle de la conversation en cours.

<p align="center"><img src="docs/assets/interface-models-fr.png" width="705" alt="Modèles"></p>

</details>

<details>
<summary>Que trouve-t-on dans chaque onglet des paramètres ?</summary>

| Onglet des paramètres | Ce qu’il permet de contrôler |
| --- | --- |
| **Démarrage** | Connexion et comptes, interrupteur pour chaque fonctionnalité, quota de l’abonnement, affichage du quota et alertes |
| **Modèles** | Modèle par défaut, intensité de raisonnement par défaut et liste des modèles, style des réponses ; le groupe Avancé replié contient la longueur du contexte, les nouvelles tentatives, le mode de connexion, la compaction dans le cloud et le modèle de révision |
| **Web et outils** | Interrupteur général pour les autres modèles, source de recherche, connecteurs ChatGPT, sous-tâches officielles Codex |
| **Créer** | Génération et retouche d’images, @image dans la zone de rédaction, visionneuse d’images, canevas de croquis et dessin par l’agent |
| **Téléphone et plus** | Contrôle à distance par téléphone, appels vocaux expérimentaux, cache local, diagnostics d’assistance |

La conversation vocale est désactivée par défaut. Activez-la dans **Téléphone et plus**, puis démarrez un appel depuis la zone de saisie. Si une fenêtre native, y compris sous Linux, ne prend pas en charge WebRTC, DSH vous propose de poursuivre la même conversation dans un navigateur. Les échantillons vocaux restent disponibles et votre abonnement existant est utilisé sans clé API.

**Contexte adapté au modèle** suit le répertoire de modèles de votre compte ; l’actualisation conserve votre brouillon non enregistré. Les paramètres affichent la fenêtre brute ; les budgets de conversation réservent une marge selon le pourcentage officiel (5 % s’il n’est pas précisé), puis DSH gère les réservations de sortie et la compaction. Aucun calcul manuel n’est nécessaire. Les groupes de quotas utilisent les valeurs fournies par le backend, y compris les compartiments séparés tels que Spark.

Les échecs d’abonnement restent visibles : aucun basculement silencieux vers une autre offre payante.

</details>

<a id="images-and-sketching"></a>

## Images et croquis

Générez des images avec votre abonnement, affichez et téléchargez les originaux, ou sélectionnez une zone et ajoutez des notes pour continuer à la modifier. La génération et la modification d’images se contrôlent dans **Paramètres → Codex → Créer**.

<a id="sketch-board-beta"></a>

### Tableau de croquis (bêta)

Le tableau de croquis et le dessin par l’Agent sont en **bêta** et désactivés par défaut ; activez-les dans la page Créer. Dessinez à la main à l’aide du bouton de croquis dans la zone de saisie, ou envoyez `@sketch` avec une demande pour que l’Agent dessine.

Le tableau prend en charge les calques, les courbes natives, les pinceaux, les dégradés, le flou, les modes de fusion, l’écrêtage, l’annulation et le rétablissement, ainsi que les raccourcis. Enregistrez plusieurs brouillons et exportez des PNG ou des brouillons modifiables. Avec une référence, l’Agent peut comparer les images, mesurer les couleurs et les positions, et annuler. Les dessins terminés peuvent être rejoués et enregistrés en vidéo.

<details>
<summary>Exemple de dessin par l’Agent : fille-baleine</summary>

Les agents ont dessiné ces exemples sur le tableau de croquis avec des traits natifs modifiables, sans faire appel à la génération d’images. Les trois utilisaient la même référence et les mêmes réglages de base pour l’outil de dessin. Il s’agit d’exécutions individuelles avec des niveaux d’intensité et des durées différents.

<p align="center"><b>Image de référence</b><br><img src="docs/assets/sketch-niang-reference.webp" width="320" alt="Image de référence originale de la fille-baleine"></p>

<table>
<tr><th width="33%">GPT-6-Astra</th><th width="33%">GPT-6.1-Sol</th><th width="33%">DeepSeek Flash</th></tr>
<tr><td><img src="docs/assets/sketch-niang-astra-compare.webp" width="280" alt="Dessin de la fille-baleine réalisé par GPT-6-Astra sur le tableau de croquis"></td><td><img src="docs/assets/sketch-niang-sol-6-1.png" width="280" alt="Dessin de la fille-baleine réalisé par GPT-6.1-Sol sur le tableau de croquis"></td><td><img src="docs/assets/sketch-niang-deepseek-flash.png" width="280" alt="Dessin de la fille-baleine réalisé par DeepSeek Flash sur le tableau de croquis"></td></tr>
<tr><td>Moyenne · 20 min 57 s<br>686 traits</td><td>Élevée · premier tour : 23 min<br>1 020 traits</td><td>Élevée · 9 min 33 s<br>623 traits</td></tr>
</table>

Après une interruption de connexion, le dessin de 6.1 a été restauré à partir de l’enregistrement automatique et des appels réussis d’origine. Le modèle a ensuite vérifié l’aperçu et l’a enregistré, sans ajout de dessin manuel. Cette exécution n’a pas réussi sans interruption.

</details>

[Modification d’images et stockage des brouillons →](docs/GUIDE.en.md#image-generation-and-editing)

<a id="phone-remote-control-beta"></a>

## Contrôle à distance depuis le téléphone (bêta)

Associez la section Codex de l’application mobile ChatGPT à DSH sur votre ordinateur. Démarrez ou poursuivez des conversations, utilisez des outils et gérez les demandes d’autorisation depuis votre téléphone, avec DeepSeek ou tout autre modèle DSH.

**Désactivé par défaut.** Activez cette option dans **Paramètres → Codex → Téléphone et plus → Contrôle à distance depuis le téléphone**, puis associez l’appareil à l’aide d’un QR code ou d’un code manuel. Votre ordinateur doit rester allumé, connecté et DSH doit être en cours d’exécution.

Il s’agit d’une couche de compatibilité tierce qui utilise le service de connexion à distance d’OpenAI. Le contrôle à distance officiel de Codex existe, mais la compatibilité avec l’hôte DSH n’est pas explicitement garantie par OpenAI et peut changer lors des mises à jour du service. Vous pouvez à tout moment supprimer les appareils associés ou désactiver cette fonction.

Cliquez sur **Afficher le code d’association** sur l’ordinateur. Scannez le code QR ou saisissez le code manuel dans Codex dans l’application ChatGPT. Choisissez l’ordinateur associé pour envoyer des messages et des images.

<details>
<summary>Opérations prises en charge depuis le téléphone</summary>

- suivre, démarrer, poursuivre, interrompre et archiver des conversations ; rechercher des conversations et des mots-clés à l’intérieur de celles-ci ;
- changer de modèle, de niveau de raisonnement et d’autorisation (écriture dans l’espace de travail / accès complet) ;
- les demandes d’autorisation et les questions s’affichent sur le téléphone ; en cas de déconnexion, elles réapparaissent lorsque vous le rouvrez, sinon elles sont renvoyées à l’ordinateur ;
- les réponses s’affichent au fur et à mesure de leur rédaction ; les commandes, les modifications de fichiers avec différences, la liste des tâches, les recherches sur le Web, les appels aux connecteurs et les images générées utilisent les vues natives du téléphone ;
- envoyer des photos, utiliser @ pour rechercher des fichiers sur l’ordinateur, / pour sélectionner des compétences DSH, consulter les changements avec git en lecture seule et démarrer des discussions dans un véritable sélecteur de dossiers ;
- les espaces de travail DSH apparaissent comme des projets ; cloner une conversation, consulter les limites d’utilisation, l’utilisation cumulée et l’utilisation du contexte ; lorsque DSH prend en charge `/compact`, compacter le contexte depuis le téléphone ;
- les erreurs de modèle s’affichent sur le téléphone ; les téléphones associés sont répertoriés dans les paramètres et peuvent être supprimés.

</details>

<a id="all-features"></a>

## Toutes les fonctionnalités

L’accès aux modèles et les quotas dépendent de votre compte.

<details>
<summary><b>Modèles et recherche</b></summary>

Choisissez le modèle selon la tâche, le raisonnement selon l’analyse nécessaire et la vitesse selon les modes pris en charge. Le niveau de détail guide la rédaction de la réponse. Dans **Web et outils**, la recherche trouve des pages et la lecture ouvre une URL déjà connue.

| Fonctionnalité | Ce que vous pouvez faire | Disponibilité / configuration |
| --- | --- | --- |
| **Connexion à l’abonnement** | Connectez-vous à ChatGPT et utilisez les modèles d’abonnement Codex sans clé API | Le chat normal ne nécessite pas Codex CLI |
| **Synchronisation du catalogue des modèles** | Lire les modèles et niveaux de raisonnement disponibles sur votre compte, avec actualisation manuelle ; le dernier catalogue récupéré avec succès est stocké localement pour chaque compte et reste disponible pendant l’actualisation en arrière-plan après le redémarrage, pendant 24 heures ; les modèles signalés comme devant être retirés affichent leur date de retrait à côté de leur nom, sans changement automatique de votre sélection | Les nouveaux modèles apparaissent lorsque votre compte les propose ; le catalogue du compte est l’unique source, donc aucun modèle n’est affiché si vous êtes déconnecté ou si aucune lecture distante ni aucun cache valide n’est disponible |
| **Liste des modèles** | Afficher ou masquer des modèles individuels dans le sélecteur de la zone de rédaction, sur la page Modèles ; le sélecteur conserve les libellés de modèles propres à DSH (tels que le badge de nouveau modèle) | Affichage uniquement ; les modèles sélectionnés et les requêtes continuent de fonctionner |
| **Menu des modèles de la zone de saisie** | Ajoute la vitesse et le niveau de détail via les extensions du menu DSH et cède la place en cas de conflit entre sélecteurs. | Réglage dans Modèles. Votre préférence reste enregistrée. |
| **Suggestions de saisie (Bêta)** | Après une réponse terminée, la zone de saisie vide peut suggérer le prochain message. Tab l’insère dans un brouillon modifiable. | Désactivées par défaut dans Modèles. Elles nécessitent un modèle Codex compatible et un compte autorisé. Les requêtes peuvent être comptabilisées. |
| **Modèle par défaut** | Choisir le modèle utilisé à l’ouverture d’une nouvelle conversation, sur la page Modèles | Définit le modèle par défaut de DSH, le même que celui défini lors du changement de modèle dans une conversation ; effacez ce réglage pour suivre le modèle par défaut de DSH |
| **Intensité de raisonnement par défaut** | Choisir un niveau par défaut pour les modèles d’abonnement, sur la page Modèles ; « Valeur par défaut du modèle » suit la recommandation officielle du catalogue pour chaque modèle | Les choix manuels sont prioritaires. Les niveaux non pris en charge sont remplacés par le niveau par défaut valide du modèle ; les choix manuels déjà définis pour une conversation sont conservés |
| **Niveaux de raisonnement** | Choisir une intensité de raisonnement prise en charge dans la zone de rédaction | Les niveaux varient selon le modèle |
| **Raisonnement Ultra** | DSH peut répartir le travail indépendant entre ses sous-tâches natives avec le niveau de raisonnement pris en charge par le modèle. | Disponible lorsque le modèle et le profil d’agent le permettent. Ultrafast est un mode de vitesse. |
| **Niveaux de vitesse** | Basculer les modèles pris en charge entre Standard et Rapide ; Ultrarapide (Bêta) est également disponible si le catalogue du compte le propose, avec un indicateur en forme d’éclair | Standard par défaut. Rapide et Ultrarapide consomment plus de quota. Les modes disponibles dépendent du compte et du modèle. |
| **Verbosit​​é des réponses** | Demander des réponses courtes, moyennes ou détaillées | Suit le réglage par défaut du modèle, sauf modification |
| **Détail des images envoyées** | Choisir le niveau de détail Faible, Élevé, Original ou Auto pour les images envoyées au modèle de chat | Influe sur les jetons d’entrée ; Auto par défaut |
| **Recherche Web par abonnement** | Sources Auto, DSH et Codex | Réglage dans Web et outils. Automatique choisit la source selon le modèle. Avec les réglages Web partagés, le module DSH de recherche et de lecture Web affiche la même sélection. La lecture se règle séparément. |
| **Source de lecture des pages Web** | Choisissez la façon d’ouvrir une URL connue indépendamment du moteur de recherche. | Dans Web et outils. DSH est la valeur par défaut. Codex exige un hôte compatible et signale les échecs. |
| **Interrupteur Autres modèles** | Un seul interrupteur empêche les conversations utilisant DeepSeek et d’autres modèles non-Codex d’utiliser la recherche Web par abonnement, la génération d’images et les connecteurs ChatGPT | Paramètres → Abonnement Codex → Web et outils ; activé par défaut, sans effet sur les modèles d’abonnement Codex ; le contrôle à distance par téléphone et la voix sont lancés par vous et ne sont pas concernés |
| **Portée de la recherche** | Choisir la recherche en direct / en cache, désactiver la recherche ou limiter les domaines | Dans Web et outils. S’applique uniquement aux recherches de l’abonnement Codex. |
| **Délai d’inactivité du flux** | Définir combien de temps une requête peut ne recevoir aucune donnée en flux avant d’être interrompue | 10 minutes par défaut ; ne constitue pas un délai limite global de réponse |
| **Budget de contexte** | Utiliser un budget standard, étendu ou personnalisé pour chaque modèle | Limité par le catalogue de modèles |
| **GPT-Reserve** | Sélectionner le modèle de réserve lorsque votre compte le propose | Expérimental ; aucun quota de réserve distinct n’est garanti |

</details>

<details>
<summary><b>Comptes et quota</b></summary>

Consultez **Démarrage → Quota d’abonnement** pour connaître le solde et les dates de réinitialisation. Les fenêtres courte et hebdomadaire peuvent s’appliquer ensemble. La répartition décrit les usages passés et l’estimation extrapole le rythme récent. Activez l’affichage du quota dans la zone de saisie pour le consulter pendant un échange.

| Fonctionnalité | Ce que vous pouvez faire | Disponibilité / configuration |
| --- | --- | --- |
| **Comptes multiples** | Ajouter, changer, supprimer des comptes ou se déconnecter de tous les comptes | Settings → Codex → Start |
| **Détails du quota** | Consulter les périodes courtes / hebdomadaires, les heures de réinitialisation et les groupes de quotas distincts | Seules les périodes et les groupes fournis par le backend sont affichés |
| **Utilisation de votre allocation** | Dans la carte de quota, voir la répartition de l’allocation de chaque semaine par modèle, interface, source et déclencheur | À partir du rapport d’utilisation officiel : données approximatives, susceptibles d’avoir un ou deux jours de retard ; masqué si le compte ne dispose d’aucun rapport |
| **Aperçu de l’utilisation** | Dans la carte de quota, consulter le nombre total de jetons utilisés, le jour le plus actif, les séries, le niveau de raisonnement le plus utilisé et une carte thermique quotidienne sur six mois | À partir des statistiques d’utilisation officielles ; masqué si le compte n’en dispose pas |
| **Crédits et cartes de réinitialisation** | Consulter les crédits supplémentaires, les plafonds de dépenses et les cartes de réinitialisation disponibles | Affichés lorsqu’ils sont fournis pour votre compte |
| **Quota dans la zone de rédaction** | Voir le quota restant sous forme de pourcentage ou de barre de progression pendant la conversation | Désactivé par défaut ; choisissez le mode d’affichage |
| **Estimation de l’autonomie** | Survoler ou cliquer sur le quota dans la zone de rédaction pour voir à quel moment l’utilisation récente l’épuiserait | Bêta ; estimation facultative, sans garantie |
| **Alertes de quota** | Utiliser des seuils fixes, anticipés ou personnalisés pour les périodes courtes / longues | 20 % restants par défaut ; possibilité de désactivation |
| **Utiliser des cartes de réinitialisation** | Utiliser une carte de réinitialisation disponible après confirmation | Mesures de protection avec confirmation et attente ; le serveur détermine le résultat |
| **Réessayer après réinitialisation** | Attendre la confirmation de la réinitialisation de la période courte avant de continuer | Désactivé par défaut ; l’attente peut être interrompue |

</details>

<details>
<summary><b>Images et croquis</b></summary>

Générez une nouvelle image ou indiquez une retouche précise à l’aide d’une référence ou d’un repère commenté. Fermer la visionneuse enregistre les repères. **Ajouter au champ de saisie** les place dans un brouillon à relire avant l’envoi. Exportez un PNG pour partager l’image ou un brouillon natif pour conserver les calques et les traits modifiables.

| Fonctionnalité | Ce que vous pouvez faire | Disponibilité / configuration |
| --- | --- | --- |
| **Génération d’images** | Générer des images avec votre abonnement et ajuster les options disponibles de modèle / qualité de la requête ; demander un PNG avec arrière-plan transparent si nécessaire | Activée par défaut, peut être désactivée |
| **Retouche d’images de référence** | Continuer à affiner une image à l’aide de références | Activée par défaut, peut être désactivée |
| **Affichage et téléchargement des images** | Les images terminées apparaissent après la réponse sans développer l’activité des outils ; zoomer, déplacer, ajuster à la fenêtre et télécharger les originaux vérifiés | Visionneuse intégrée ; seules des prévisualisations peuvent être disponibles pour les images plus anciennes |
| **Modification par zone** | Marquer des zones, ajouter des notes et poursuivre la modification à l’aide de références de position | Fermez la visionneuse pour enregistrer les notes. Choisissez Ajouter au champ de saisie pour joindre l’image et les notes à un brouillon. |
| **Canevas manuel** | Choisir un rapport largeur/hauteur et dessiner avec un stylo, un crayon, un marqueur et des gommes | Bêta ; canevas désactivé par défaut |
| **Formes et texte** | Dessiner des lignes, des flèches, des formes, des courbes natives, ainsi que du texte / des objets modifiables | Disponible dans le canevas de croquis |
| **Dégradés, flou, modes de fusion et découpage** | Remplir avec des dégradés linéaires ou radiaux ; ajouter du flou (lueur, ombre, brume), des modes de fusion (multiplication, écran, superposition, …) et découper un trait selon une forme ; les calques peuvent aussi avoir un mode de fusion | Tout reste sous forme de propriétés modifiables et est conservé lors des déplacements, mises à l’échelle, brouillons et exportations ; l’agent dispose des mêmes fonctionnalités via les dégradés SVG, `feGaussianBlur`, `mix-blend-mode` et `clip-path` |
| **Calques et importation d’images** | Travailler avec des calques et ajouter des images au canevas | Les images sont gérées sous forme de calques |
| **Lissage et navigation** | Lisser les traits complets après leur tracé ; déplacer le canevas, zoomer, annuler et rétablir | Les raccourcis peuvent être personnalisés ou désactivés |
| **Plusieurs brouillons** | Enregistrer et rouvrir jusqu’à 20 brouillons locaux | Stockés dans le navigateur actuel |
| **Importation et exportation** | Exporter au format PNG ou en brouillons natifs qui préservent les traits modifiables | Les brouillons peuvent être réimportés pour poursuivre leur modification |
| **Dessin par l’agent** | Demander à l’agent de dessiner avec `@sketch`, suivre sa progression et l’arrêter ; l’agent peut dessiner des étapes entières en SVG, importées sous forme de traits natifs modifiables ; avec une référence, il peut comparer côte à côte, lire une carte thermique des différences, zoomer sur une zone, mesurer les couleurs et la position des contours, et annuler ; chaque lot indique l’évolution de l’erreur | Bêta ; désactivé par défaut, nécessite le canevas. Les outils mesurent et affichent uniquement ; ils ne dessinent jamais à la place du modèle |
| **Lecture et vidéo** | La lecture rejoue les traits dans l’ordre. Lancez séparément l’enregistrement pour prévisualiser et sauvegarder une vidéo WebM. | La vidéo est prévisualisée sur le tableau et n’est enregistrée que lorsque vous cliquez sur Enregistrer la vidéo ; aucun téléchargement ne démarre automatiquement |
| **Aperçu du résultat pour le modèle** | Renvoyer une image du canevas après le dessin pour permettre une vérification ultérieure | Bêta ; désactivé par défaut, augmente l’utilisation de l’entrée image |

</details>

<a id="codex-subtask-runtime"></a>

<details>
<summary><b>Fonctionnalités avancées et maintenance</b></summary>

Le contrôle à distance relie l’app ChatGPT au DSH en cours d’exécution. Un appel sert à parler dans la conversation, et une sous-tâche à déléguer une partie du travail. En cas d’échec, ouvrez **Téléphone et plus → Diagnostic d’assistance** pour identifier le prérequis ou l’opération récente concernée.

| Fonctionnalité | Ce que vous pouvez faire | Disponibilité / configuration |
| --- | --- | --- |
| **Contrôle à distance par téléphone** | Contrôler le DSH sur votre ordinateur depuis la section Codex de l’application mobile ChatGPT : démarrer, poursuivre et archiver des conversations, changer de modèle et d’autorisations, répondre aux demandes d’approbation et aux questions ; DeepSeek et tout autre modèle DSH fonctionnent | Bêta ; désactivé par défaut ; Paramètres → Codex → Téléphone et plus → Contrôle à distance depuis le téléphone, associez l’appareil par QR code ou code manuel |
| **Conversation vocale (Bêta)** | Lancez un appel depuis la zone de saisie. Un navigateur peut prendre le relais si la fenêtre native ne gère pas WebRTC. | Désactivée par défaut dans Téléphone et plus. Autorisez l’accès au microphone si demandé. |
| **Sous-tâches Codex indépendantes** | Utilisez l’abonnement pour les sous-tâches Codex et choisissez leur modèle et leur niveau de raisonnement. | Installez le sous-agent Codex dans les extensions DSH. Dans Web et outils → Sous-tâches indépendantes, préparez la CLI si demandé et sélectionnez Codex (abonnement). |
| **Compaction du contexte dans le cloud** | Poursuivre les longues conversations à l’aide de la compaction Codex tout en conservant l’historique DSH et la compaction native | Bêta / expérimental ; désactivé par défaut, les requêtes activées utilisent SSE |
| **Transport WebSocket** | Réutiliser expérimentalement les connexions et les transferts de contexte, avec un basculement vers SSE en cas d’échec de connexion | SSE par défaut. Les requêtes qui dépassent la limite WebSocket annoncée par le serveur passent à SSE avant l’envoi. |
| **Évaluateur Codex pour la vérification automatique** | La vérification automatique DSH évalue les appels d’outils avec le propre modèle de vérification de Codex ; DSH conserve sa politique de vérification et son processus d’autorisation/refus | Bêta ; désactivé par défaut, s’applique lorsque le catalogue de votre compte propose le modèle |
| **Connecteurs ChatGPT** | Permettre à DeepSeek ou à tout modèle DSH d’utiliser les applications que vous avez connectées dans ChatGPT : GitHub, Gmail, Google Drive, Calendar et plus encore ; les modèles effectuent d’abord une recherche, puis appellent l’application, et l’autorisation d’écriture dépend du mode et des droits de la session DSH | Désactivé par défaut, Paramètres → Codex → Web et outils → Connecteurs ChatGPT ; connectez d’abord les applications dans ChatGPT |
| **Diagnostics d’assistance** | Créez un rapport JSON expurgé des informations sensibles, à copier ou à télécharger. | Paramètres → Codex → Téléphone et plus → Diagnostics d’assistance. |
| **Nettoyage du cache des prévisions** | Examiner et effacer l’historique local des prévisions de quota | Préserve la connexion, les brouillons, les originaux et les dépendances partagées |

</details>

<a id="agent-reference"></a>

### Référence pour les agents et les contributeurs

DSH gère les conversations, les approbations d’outils et les permissions de l’espace de travail. L’extension apporte la connexion à Codex et les options et outils ci-dessus. Pour expliquer une fonction absente, vérifiez la version de DSH, les capacités du compte, le modèle sélectionné et le réglage avant de suivre l’outil ou la requête.

[Guide détaillé (anglais)](docs/GUIDE.en.md) · [Contrat de l’outil de croquis (anglais)](docs/sketch-agent.md) · [Réglages par défaut](src/preference-fields.js) · [Index du développement et de la documentation (en anglais)](docs/DEVELOPMENT.md)

<a id="reuse-cache-when-changing-effort"></a>

### Réutiliser le cache lors d’un changement d’intensité

Activée par défaut dans **Paramètres → Codex → Modèles → Avancé**. Elle facilite la réutilisation du cache lors d’un changement de niveau de raisonnement sur les modèles compatibles. Le cache habituel des prompts reste disponible si cette option est désactivée.

[Fonctionnement et limites (en anglais)](docs/GUIDE.en.md#reuse-cache-when-changing-effort)

<a id="update-and-uninstall"></a>

## Mettre à jour et désinstaller

Trouvez ce plugin sur la page **Plugins** de DSH et utilisez l’action de mise à jour ou de désinstallation. Suivez les éventuelles instructions de redémarrage. La désinstallation de ce plugin ne supprime pas les autres plugins.

<details>
<summary>Commandes de terminal</summary>

```sh
dsh plugin --profile web update dsh-codex-subscription@3.2.23
```

À exécuter uniquement si vous souhaitez désinstaller :

```sh
dsh plugin --profile web remove dsh-codex-subscription
```

</details>

<a id="troubleshooting"></a>

## Dépannage

<details>
<summary>Quel est le lien avec le bundle Codex officiel (dsh-hooks-codex) dans la liste des plugins ?</summary>

Ils n’ont aucun lien entre eux et peuvent être installés ensemble. Les bundles officiels Codex / Claude Code permettent à DSH d’exécuter des configurations de hooks de type Codex ou Claude Code (des scripts lancés avant et après les appels d’outils). Ce plugin se connecte avec votre abonnement ChatGPT et fournit les modèles Codex, le quota, la recherche, les images et le contrôle à distance par téléphone.

</details>

<details>
<summary>La commande dsh est introuvable sur votre ordinateur ?</summary>

Dans DSH, utilisez **Plugins → Ajouter un plugin** et collez le nom du package. Aucune configuration dans le terminal n’est nécessaire.

</details>

<details>
<summary>Vous avez plusieurs installations de DSH, ou un plugin est manquant ?</summary>

Installez le plugin depuis l’installation de DSH que vous utilisez réellement. Pour une installation depuis le terminal, exécutez les commandes dans l’environnement DSH voulu et vérifiez son profil. Ne supprimez pas de profils et ne modifiez pas le PATH de votre système pour forcer une installation.

</details>

<details>
<summary>Comment signaler un problème ?</summary>

Après avoir reproduit le problème, ouvrez **Paramètres → Codex → Téléphone et plus → Diagnostic d’assistance**, choisissez **Créer un rapport**, puis **Télécharger le rapport**. Joignez le JSON, les étapes et les versions au [rapport de bogue](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml).

</details>

<details>
<summary>Ai-je besoin de la ligne de commande Codex ?</summary>

Seules les sous-tâches indépendantes de Codex (abonnement) nécessitent la CLI. La conversation, les images et les sous-tâches natives de DSH fonctionnent sans elle. [Guide d’installation et de désinstallation (en anglais) →](docs/GUIDE.en.md#codex-subtask-runtime)

</details>

<a id="positioning-and-boundaries"></a>
<a id="scope-and-support"></a>

<a id="project-and-support"></a>

## Projet et assistance

- **Abonnement ChatGPT / Codex uniquement**, avec une prise en charge approfondie : quota et prévisions, images et croquis, sous-tâches, diagnostics. Les autres abonnements, tels que Claude ou Grok, ne sont pas concernés.
- **Signalement explicite des échecs** : les requêtes ne basculent jamais silencieusement vers une autre voie payante et les fenêtres de quota que le compte ne renvoie pas ne sont jamais inventées.
- **Suit les versions officielles de DSH** : chaque version est validée de bout en bout (installation, démarrage, suppression, réinstallation) avec les canaux officiels de DSH, tels que latest et next ; les versions vérifiées sont consignées dans les [notes de compatibilité](docs/DEVELOPMENT.md#compatibility).
- Les modèles, le quota et les fonctionnalités dépendent des données réellement renvoyées par votre compte ; le backend ChatGPT et DSH peuvent évoluer indépendamment.

Ce projet communautaire n’est ni affilié à DeepSeek ou OpenAI, ni approuvé par ces entreprises.

- Utilisez le [formulaire de signalement de bug](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml) pour faire part de vos commentaires sur le projet.
- Utilisez le [formulaire de demande de fonctionnalité](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=feature-request.yml) pour proposer des améliorations ciblées du produit.
- Les corrections ciblées et les améliorations de compatibilité sont les bienvenues ; consultez [CONTRIBUTING.md, en anglais](CONTRIBUTING.md).
- Aidez à [maintenir et développer le projet](CONTRIBUTING.md#help-maintain) : prenez en charge durablement un module, assurez le suivi des problèmes associés ou relisez du code. [Ouvrez un problème](https://github.com/WSL043/dsh-codex-subscription/issues/new?template=help-maintain.yml) pour en discuter.
- Pour discuter des plugins DSH, rendez-vous sur [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Lisez [SECURITY.md, en anglais](SECURITY.md) avant de signaler des problèmes sensibles.

Si ce projet vous est utile, le [bouton Star](https://github.com/WSL043/dsh-codex-subscription/stargazers) permet à davantage d’utilisateurs de DSH de le découvrir.

[中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md) · [MIT](LICENSE)

[![powered by dsh](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
