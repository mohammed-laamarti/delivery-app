# Diagnostic de lenteur — 17 septembre 2026

**Le backend dispose bien de 1 CPU / 2 Go, mais les lectures excessives et les actualisations répétées restent présentes en production.** Le diagnostic croise maintenant le code réellement déployé, les métriques Render, les statistiques PostgreSQL et les fichiers JavaScript publics. La priorité est de réduire le volume et la répétition des lectures. Les mesures ne justifient pas une nouvelle augmentation du backend.

Périmètre : backend Java/Spring, frontend React, commit local `1decd22`. Backend déployé : `0cbb990`, identique au backend local ; les commits suivants ne changent que le frontend. Frontend déployé : `1decd22`. Deux fichiers comportaient déjà des modifications locales (`App.css`, `DriverPage.tsx`) ; les mécanismes signalés existent aussi dans les versions déployées. Aucun code applicatif, donnée métier ni réglage Render modifié pendant ce diagnostic.

## Ce que montrent les mesures Render

| Ressource | Configuration et mesures |
| --- | --- |
| Backend `delivery-api` | Plan `1c-2g`, une instance, Francfort ; changement de service déployé le 16/09 à 16:09 UTC |
| CPU backend | Moyenne des points à 5 minutes : 0,53 % d'un CPU sur environ 24 h après le changement ; plus haut point à 1 minute entre 09:00 et 17:00 UTC le 17/09 : 7,63 % |
| Mémoire backend | Environ 460 Mio en moyenne, maximum observé 473 Mio, sur 2 048 Mio disponibles : environ 23 % |
| Avant le changement | Le 16/09 de 09:00 à 16:00 UTC : limite 0,5 CPU / 512 Mio ; mémoire maximale 479 Mio, soit 93,6 %. Le changement a donc nettement augmenté la marge mémoire |
| PostgreSQL `delivery-db` | Plan `basic_256mb`, 0,1 CPU / 256 Mio, Francfort ; la base n'a pas reçu le changement de capacité du backend |
| Utilisation PostgreSQL | Points à 1 minute du 17/09, 09:00–17:00 UTC : maximum 46,7 % de son quota CPU et 108 Mio de mémoire, soit 42,2 % ; 9 à 11 connexions sur la fenêtre d'environ 24 h |
| Réseau et index | Connexion PostgreSQL interne confirmée dans les logs de démarrage ; mêmes régions ; index applicatifs présents |

Ces points espacés ne permettent pas d'exclure des pics très courts, mais ne montrent pas de saturation durable. Le petit quota CPU de PostgreSQL peut amplifier les rafales ; son rôle précis dans les attentes n'est pas mesuré. Une saturation mémoire de la base, un manque général d'index ou un passage par l'URL externe ne sont pas étayés.

Sur la fenêtre après changement consultée : quatre avertissements de police PDF, aucune erreur applicative au niveau `error` retournée, et aucune série HTTP 5xx retournée. Les routes de santé répondent correctement. Les métriques HTTP de latence et les journaux de requêtes sont vides via ce connecteur ; aucun p95 métier n'est inventé.

Les preuves structurées sont conservées dans [diagnostic-lenteur-render-2026-09-17-preuves.json](diagnostic-lenteur-render-2026-09-17-preuves.json). Les statistiques SQL historiques commencent le 10 août et couvrent plusieurs versions et plans ; l'échantillon récent décrit ci-dessous les distingue de l'activité actuelle.

## Causes classées par priorité de correction

### 1. Critique : pagination livreur effectuée après le chargement complet

`PackageService.findDriverWorkspacePage` appelle `findDriverWorkspace`, filtre tous les DTO en Java, puis ne conserve la page demandée qu'avec `subList`. La base charge auparavant tous les colis correspondant à l'espace livreur, leurs historiques et leurs tentatives. Le résumé des compteurs appelle séparément la même lecture complète.

La liste inclut notamment la file commune de l'agence, les colis annulés et les colis livrés affectés au livreur, sans limite de date dans la requête principale. Même filtrer sur aujourd'hui ou afficher 25 colis ne limite donc pas le travail initial.

L'endpoint `/api/packages/driver-view/{id}` charge lui aussi tout l'espace pour retrouver un seul identifiant.

**Impact actuel mesuré :** 1 948 colis en base et 7 livreurs actifs. Selon le livreur, la requête d'espace charge entre **454 et 833 colis** (627 en moyenne), avant de conserver la page demandée. Sur 64 secondes de trafic réel, cette requête a été exécutée 14 fois et a renvoyé 10 820 lignes, soit 773 par appel en moyenne, avec **177 ms d'exécution SQL moyenne**. Ce temps exclut le reste des requêtes, le traitement Java et l'affichage.

**Preuves :** `PackageService.java:124–194`, `PackageRepository.java:65–82`, `PackageController.java:144–150`.

**Vérification exécutée :** test existant `returnsTheDriverWorkspaceInBoundedPages`, avec journal SQL Hibernate. Les deux pages demandées exécutent chacune une requête colis sans `LIMIT`, `OFFSET` ni `FETCH FIRST`, puis deux requêtes d'historique/tentatives pour les trois colis du jeu de test. La taille de réponse est bornée ; le travail en base ne l'est pas. Ce test H2 confirme la mécanique, pas une durée sur PostgreSQL en production.

**Correction :** exprimer les règles de visibilité, filtres et dates en base ; paginer avant l'enrichissement ; calculer les compteurs par agrégations SQL ; lire un colis par son ID avec contrôle d'accès ciblé. Préserver les règles métier des reports et réservations lors de cette réécriture.

### 2. Critique sous activité : les événements temps réel multiplient les rechargements

Le serveur diffuse chaque changement à tous les abonnés. Chaque écran livreur répond en rechargeant sa page puis ses compteurs : deux traitements complets du point 1. Il n'y a ni regroupement des événements, ni partage des requêtes déjà en cours dans ce parcours, ni ciblage des abonnés concernés. Un onglet masqué conserve également son abonnement.

`publishAll` émet un événement par colis pour une expédition groupée de retours. Exemple théorique, non mesure de trafic : 20 colis modifiés avec 10 écrans livreur abonnés peuvent entraîner 400 requêtes de lecture (20 × 10 × 2), hors administrateurs et appels liés à l'action initiale.

Le comportement de rechargement de la page puis des compteurs est confirmé dans le JavaScript déployé. Les statistiques SQL récentes montrent bien des répétitions ; elles ne permettent pas à elles seules d'attribuer chaque appel à un événement SSE plutôt qu'à une recherche, une navigation ou une action.

**Preuves :** `RealtimeEventService.java:33–54`, `DriverPage.tsx:430–438,515–529`, `PackageController.java:282–285,377–379`.

**Correction :** regrouper les changements rapprochés, limiter à une actualisation en cours par écran, cibler les destinataires et envoyer un événement groupé pour les opérations en lot.

### 3. Élevée : l'administrateur télécharge toutes les pages avant affichage

`loadAllPackagePages` demande 100 colis, puis lance toutes les pages restantes dans un `Promise.all` sans limite de concurrence. L'affichage initial attend l'ensemble. Les dates et la pagination visible sont ensuite appliquées dans le navigateur. Un retour sur l'onglet ou plusieurs actions métier relancent ce chargement intégral.

Avec les **1 948 colis actuels**, un chargement complet demande **20 pages**, dont 19 lancées ensemble après la première, plus les utilisateurs et les statistiques. Chaque page implique aussi l'enrichissement historique du point suivant. La déduplication `dashboardRequest` évite certains doublons simultanés, mais ne réduit pas le volume d'un chargement. Dans l'échantillon récent de 64 secondes, 31 lectures de pages ont renvoyé 3 048 colis, avec une moyenne SQL de **81 ms** par lecture.

**Preuves :** `api/client.ts:82–149`, `App.tsx:711–749`.

**Correction :** demander uniquement la page et la période visibles ; exposer des endpoints de statistiques agrégées ; charger progressivement le reste uniquement si nécessaire.

### 4. Élevée : les listes reconstruisent leurs informations depuis tous les historiques

`loadReadContext` lit tous les historiques et toutes les tentatives des colis sélectionnés, par lots de 1 000 identifiants. Les DTO recalculent ensuite dernier commentaire, confirmation et report depuis ces collections. Le chargement groupé évite certaines requêtes par colis, mais son volume augmente avec la durée de vie des données.

**Impact actuel mesuré :** la base contient 7 424 historiques et 1 337 tentatives. Sur 64 secondes, 45 lectures groupées ont renvoyé **47 229 lignes d'historique** et **7 272 tentatives**. Moyennes SQL respectives : **109 ms** et **21 ms** par appel. Les mêmes données sont donc effectivement relues à grande fréquence.

Les listes peuvent aussi réparer des commentaires ou activer des reports à l'intérieur de transactions d'écriture. Cela ajoute des vérifications de modifications et, pour les données concernées, des écritures au chemin de lecture. Une contention effective en production n'est pas encore démontrée.

**Preuves :** `PackageService.java:81–98,1076–1202,1257–1336,1346–1361`.

**Correction :** conserver les informations courantes utiles aux cartes ou sélectionner uniquement les derniers événements nécessaires ; réserver les historiques complets à la vue détail ; séparer les migrations/rattrapages et les transitions planifiées des lectures usuelles.

### 5. Moyenne à élevée : une recherche déclenche une requête à chaque frappe

Le changement de `query` relance immédiatement l'effet de chargement. Le nettoyage de l'effet ignore les résultats devenus obsolètes mais n'annule pas les requêtes déjà parties. Une saisie rapide peut donc empiler plusieurs recalculs complets.

**Preuves :** `DriverPage.tsx:365–368,394–424`, `api/client.ts:66–79,179–186`.

**Correction :** attendre une courte pause de saisie, annuler les anciennes requêtes et exécuter le filtre en SQL.

### 6. Moyenne : les statistiques chargent les événements pour les compter en Java

`latestPackageResults` récupère les tentatives de toute la journée, les groupe en Java et sélectionne la dernière par colis. Plusieurs écrans/statistiques répètent ce travail. Les statistiques globales du tableau de bord sont relancées à chaque modification de `packages`. L'activité d'un seul livreur lit aussi d'abord les tentatives de tous les livreurs pour la journée.

**Preuves :** `DeliveryAttemptService.java:48–100,168–177`, `App.tsx:86–100,735–741`.

**Correction :** sélectionner et agréger en base, filtrer par livreur en amont et partager les résultats des compteurs entre composants.

### 7. Moyenne, pendant les imports : travail synchrone ligne par ligne

L'import Excel vérifie l'existence de chaque code puis enregistre chaque nouveau colis dans une boucle, au sein de la requête HTTP et d'une transaction. Cela multiplie les échanges avec PostgreSQL et retarde la réponse sur les gros fichiers. L'import termine par une actualisation générale des clients.

**Preuves :** `ExcelImportService.java:24–85`, `PackageController.java:241–252`.

**Correction :** vérifier les codes en lots, insérer en lots avec une stratégie compatible avec la génération d'identifiants, et traiter les gros imports en tâche de fond si leur durée le justifie.

## Limites et hypothèses non démontrées

- Le p95 et la durée complète des endpoints métier ne sont pas disponibles. Les durées SQL ne sont pas des durées d'affichage.
- Les métriques ne prouvent ni saturation du backend, ni saturation durable de PostgreSQL. La mémoire JVM, les pauses GC et les attentes du pool Hikari ne sont pas instrumentées dans les éléments consultés.
- Au moment de l'inspection PostgreSQL, 10 connexions étaient inactives et aucune attente de verrou n'était observée ; le compteur de deadlocks vaut zéro. Cela n'exclut pas une attente ponctuelle à un autre moment.
- Une explication SQL isolée, à chaud, de la page administrateur prend environ 0,9 ms pour la première page et 5,4 ms pour la dernière (`OFFSET 1900`). Elle utilise l'index de date, sans lecture disque ni écriture temporaire. Cette exécution isolée ne reproduit pas une rafale de requêtes ni le transfert des résultats vers Java et ne remplace pas les moyennes du trafic réel.
- Les millions d'anciennes requêtes par colis visibles depuis août ne sont pas attribués à la version actuelle : le code récent dispose de chargements groupés.

Les index de `PackageSchemaMigration.java:83–94` sont confirmés en production, et la compression JSON est activée dans la configuration déployée. La connexion utilise bien le réseau interne recommandé par [Render](https://render.com/docs/postgresql-creating-connecting).

Les anciens journaux présents sur le disque sont des traces locales ; ils ne constituent pas des preuves de l'état actuel de Render. L'OCR tourne dans le navigateur et peut expliquer la lenteur du scanner sur un téléphone, mais pas à lui seul celle de toutes les pages.

## Vérifications du déploiement public

L'URL a été retrouvée dans un onglet existant de l'application. Le JavaScript public indique l'adresse de l'API. Les observations suivantes ont été réalisées sans authentification, sans modification et sans test de charge, depuis cette machine le 17 septembre 2026.

| Cible | Résultat observé |
| --- | --- |
| `https://delivery-web-uhw2.onrender.com/` | HTTP 200, page HTML reçue en 286 ms |
| JavaScript principal `index-B02t4oI2.js` | HTTP 200, premier octet en 280 ms, transfert complet non compressé en 422 ms |
| CSS principal | HTTP 200, reçu en 217 ms |
| `https://delivery-api-nq31.onrender.com/actuator/health` | Trois réponses HTTP 200, état `UP`, en 186 ms, 164 ms et 233 ms |

Une demande distincte acceptant la compression a reçu le JavaScript principal en Brotli (`content-encoding: br`), 79 465 octets transférés, avec `cf-cache-status: HIT`. Le fichier brut fait 264 923 octets. Une absence de compression des fichiers statiques n'explique donc pas la lenteur générale dans cette observation.

Dans `index-B02t4oI2.js`, le code déployé contient bien le chargement initial de `/api/packages/page?page=0&size=100`, suivi du `Promise.all` de toutes les autres pages. Il recharge également au retour sur l'onglet. Dans `DriverPage-M4GH-2hg.js`, chaque événement `package` ou `refresh` appelle la fonction qui recharge la page, puis les compteurs ; l'effet de recherche est déclenché directement par la valeur saisie. Ces défauts frontend ne sont donc pas seulement présents dans une copie locale.

**Interprétation limitée :** au moment des sondes, le site statique et la route de santé étaient disponibles et rapides. Ces résultats seuls ne mesurent ni les pages authentifiées ni les temps sous charge ; les métriques et statistiques SQL présentées plus haut complètent cette observation.

Copies des fichiers publics inspectés : `/tmp/delivery-render-public-audit/`. Empreintes SHA-256 : JavaScript principal `5a1fbe6f23a99a5f5383f61f9177cc50c267f93f0c5f28bb79f80c725c52f145` ; module livreur `dcf439179cc938b7d149725139df826fafbe972ad5c20a4aecf6d66b524c7883`.

## Vérifications réalisées et ordre d'intervention

Deux tests ciblés réussis : pagination existante et chargement groupé des historiques. Commande : `sh ./mvnw -q -Dtest=DriverAssignedPackagesTest#returnsTheDriverWorkspaceInBoundedPages,PackageServiceReadPerformanceTest -Dlogging.level.org.hibernate.SQL=DEBUG test`. Journal local : `/tmp/delivery-perf-audit-tests.log`.

Après confirmation de « Mohammed.'s workspace », lecture des services et déploiements, métriques avant/après changement de plan, logs, index, volumes, activité PostgreSQL, statistiques SQL et deux plans d'exécution de SELECT. L'échantillon de trafic SQL récent couvre le 17/09 de 17:21:38,623 à 17:22:42,892 UTC, sans remise à zéro des compteurs ni génération de charge concurrente.

L'ordre conseillé est : vraie pagination et compteurs SQL côté livreur ; regroupement des actualisations temps réel ; chargement administrateur limité à la page/période visible ; allègement des historiques ; délai et annulation de recherche ; statistiques agrégées ; import par lots. Ajouter ensuite une mesure des temps par endpoint et des attentes SQL pour comparer avant/après. Une nouvelle hausse du backend n'est pas justifiée par les ressources observées. La disponibilité des métriques de latence et des journaux HTTP dépend aussi du plan d'espace Render : [documentation des métriques](https://render.com/docs/service-metrics), [documentation des logs](https://render.com/docs/logging).
