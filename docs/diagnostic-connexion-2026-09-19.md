# Diagnostic des messages de connexion — 19 septembre 2026

## Conclusion

Des défauts de gestion des erreurs et de reprise sont confirmés dans l'application publiée. Les observations ne démontrent pas une panne générale ni une saturation de Render. Elles ne permettent pas d'attribuer chaque incident utilisateur : il manque l'URL utilisée, l'heure d'un incident et la trace réseau du navigateur concerné.

Inspection en lecture seule de Render et des URLs publiques, vers 21:41–21:44 UTC (22:41–22:44 au Maroc). Aucun changement de code applicatif, configuration, compte ou donnée métier ; aucun déploiement. Un appel GET avec un jeton volontairement invalide a servi à vérifier le refus d'accès, après la fenêtre des métriques.

## État réellement publié

- Espace confirmé par l'utilisateur : `Mohammed.'s workspace`.
- API : `srv-d9slndajnfac739nabfg`, https://delivery-api-nq31.onrender.com ; 1 CPU / 2 Gio, une instance, Francfort, non suspendue.
- Backend actuel : `ce80b61`, rétabli par rollback le 19 septembre à 10:24:26 UTC, soit 11:24 au Maroc. Le déploiement automatique est désactivé. Le précédent déploiement était `8a7baf3`.
- Frontend Render : `656b9c7`, publié le 18 septembre à 18:58:40 UTC. Fichiers publics inspectés : `index-BKWyCHDZ.js` et `DriverPage-BGnSLKEa.js`.
- Les sources frontend et les fichiers de sécurité/configuration examinés ne diffèrent pas entre le backend rétabli et le dépôt local. Les changements backend de `8a7baf3` concernent le classement/chargement des colis, pas la logique de connexion.
- PostgreSQL : `delivery-db`, `basic_256mb`, Francfort, état `available`.

## Mesures Render

Fenêtre : 18 septembre 00:00 au 19 septembre 21:40 UTC. Résolution de 300 secondes. Les maxima sont des maxima des points agrégés, pas des pics instantanés.

| Mesure | Résultat |
| --- | --- |
| CPU API, maximum d'une série d'instance | 0,06247 CPU sur 1 CPU, soit 6,25 % |
| Mémoire API, maximum d'une instance | 763 097 100 octets, environ 728 Mio sur 2 048 Mio (35,5 %) |
| Nombre d'instances, série retournée | 1 à tous les points |
| CPU PostgreSQL | Maximum 0,011995 CPU sur 0,1, soit environ 12 % du quota |
| Mémoire PostgreSQL | Maximum environ 98 Mio sur 256 Mio (38,3 %) |
| Connexions PostgreSQL | 10 à 20 |

Somme des compteurs HTTP retournés par statut sur cette fenêtre : 31 268 réponses 200, 148 réponses 201, 1 réponse 204, 14 réponses 400, 16 réponses 401, 88 réponses 403 et 3 réponses 499. Aucune série 5xx retournée. Ces compteurs ne dénombrent ni les utilisateurs touchés ni les échecs avant d'atteindre Render.

Les journaux filtrés `error` du 17 au 19 septembre et les journaux filtrés 500/502/503/504 n'ont renvoyé aucune entrée. Les journaux de requêtes 401/403/499 sont également vides malgré les compteurs HTTP correspondants : ils ne permettent donc pas d'identifier les routes, les utilisateurs ou la cause de ces refus. Les métriques filtrées par route sont vides, ainsi que les métriques de latence ; aucun temps de réponse métier ni p95 ne peut en être déduit.

Tests publics depuis cette machine : santé API `UP`, HTTP 200 en 292 ms puis 470 ms ; page frontend accessible ; précontrôle CORS du login HTTP 200 autorisant l'origine exacte `https://delivery-web-uhw2.onrender.com`. Le GET de page livreur avec un jeton invalide répond 403 avec l'en-tête CORS correct. Le navigateur peut donc lire ce refus pour cette origine.

## Défauts applicatifs constatés

### 1. Les messages confondent plusieurs causes

Dans `delivery-frontend/src/components/LoginPage.tsx:17`, toute `TypeError` devient « Le serveur est inaccessible. Vérifiez votre connexion puis réessayez. ». Un échec de transport ou CORS peut produire ce résultat ; ce message ne diagnostique pas Render. Le fichier public contient bien cette logique et la bonne URL de l'API.

Dans `DriverPage.tsx:410` et `:444`, les blocs `catch` remplacent toutes les erreurs, y compris un accès refusé, par « Vérifiez la connexion puis actualisez ». Dans `App.tsx:744`, une erreur de chargement initial devient « Le backend est indisponible. Lance Spring Boot sur le port 8080. », même si le problème est l'authentification.

Conséquence : un serveur accessible qui refuse la session peut être présenté à l'utilisateur comme un problème de réseau.

### 2. Expiration des sessions mal expliquée

La configuration versionnée fixe le JWT à 28 800 000 ms, soit huit heures (`application.yaml:35`). La valeur effective pourrait être surchargée par l'environnement ; elle n'a pas été inspectée. Aucun renouvellement de session n'apparaît dans le client examiné.

`api/client.ts:110` transforme les 401/403 en erreur simple. Les écrans peuvent ensuite masquer son texte comme décrit ci-dessus. Le flux temps réel, lui, appelle la déconnexion sur 401/403 (`:269`), sans message explicatif. Après une reconnexion du flux, une session périmée peut donc ramener au login.

Les 104 réponses 401/403 observées sont compatibles avec des problèmes d'authentification/autorisation, mais ne prouvent pas 104 sessions expirées : mauvais identifiants, absence de jeton, droits insuffisants ou origine refusée restent possibles.

### 3. Rétablissement du réseau incomplet

`api/client.ts:250–304` reconnecte le flux SSE après fermeture/erreur avec une attente fixe de deux secondes. Toutefois :

- Aucun délai maximal de silence : `reader.read()` peut rester en attente si une connexion reste bloquée sans erreur détectée.
- Aucun traitement de l'événement navigateur `online` pour recharger immédiatement les données.
- L'événement serveur `ready` n'entraîne aucun rafraîchissement dans les abonnés admin/livreur. Les changements manqués pendant la coupure ne sont pas rattrapés à la reconnexion seule.
- Les chargements HTTP ordinaires n'ont ni délai maximal explicite ni reprise automatique contrôlée.
- Le message d'échec livreur n'est pas effacé par un simple chargement réussi (`loadPackages`, `refreshPackages`). Il peut rester visible après le retour du service.

Le retour sur un onglet visible déclenche bien un chargement : la reprise n'est donc pas totalement absente. En revanche, une coupure suivie d'un retour réseau alors que la page reste visible est mal couverte.

Ces défauts expliquent comment une interruption transitoire peut laisser une interface en erreur ou des données anciennes. Leur fréquence réelle sur les téléphones n'est pas mesurée.

## Rôle possible des déploiements

Plusieurs remplacements d'instance ont eu lieu le 18 septembre, puis le rollback le 19 à 11:24 heure du Maroc. Render remplace l'instance et termine l'ancienne lors d'un déploiement ; un flux long SSE doit pouvoir se reconnecter. Cela constitue un déclencheur possible du défaut de reprise, sans prouver une indisponibilité HTTP générale ni une panne de la plateforme. Source : [cycle de déploiement Render](https://render.com/docs/deploys#zero-downtime-deploys).

Le plan actuel n'est pas un plan gratuit. Les mesures ne justifient pas de payer davantage de CPU/mémoire pour traiter ces symptômes.

## Ce qui reste à confirmer

Le texte exact « hors connexion » n'existe ni dans les sources frontend examinées ni dans les deux bundles publics inspectés. Il peut venir du navigateur, d'un autre déploiement ou d'une reformulation du message. L'URL et l'heure d'un incident ont été demandées à l'utilisateur. Un test réussi depuis cette machine ne démontre pas l'accessibilité depuis chaque réseau mobile.

## Corrections prioritaires proposées

1. Conserver le statut et la catégorie de l'erreur : session expirée, accès refusé, transport/CORS, erreur serveur. Afficher une reconnexion explicite lorsque la session expire.
2. Rafraîchir page et compteurs au retour réseau et à la reconnexion SSE ; détecter un flux silencieux au-delà d'un seuil supérieur au heartbeat ; limiter et espacer les reprises.
3. Effacer uniquement les anciennes erreurs de synchronisation lorsqu'une synchronisation réussit. Ajouter des délais aux requêtes et une reprise limitée pour les lectures ; ne pas rejouer aveuglément les opérations métier.
4. Ajouter une télémétrie sans jeton ni données personnelles : heure, version frontend, route, statut, durée, état réseau, motif de reconnexion et identifiant de requête. Elle permettra d'attribuer précisément les prochains incidents.

Ces corrections n'ont pas été appliquées dans le cadre de cette vérification.

## Vérification ciblée du texte « Le serveur est inaccessible »

Contrôle supplémentaire à la demande de l'utilisateur : le texte exact apparaît dans le bloc `catch` du login, uniquement lorsque l'erreur est une `TypeError`. Le bloc couvre `login`, `saveAuth` et le callback `onLogin`, pas seulement la requête réseau. Une erreur de programmation de ce type dans ce parcours serait donc également mal étiquetée ; aucune n'a été reproduite.

Des simulations isolées ont exécuté la fonction `request` extraite du code TypeScript et l'expression de classification extraite de `LoginPage.tsx`, sans accéder aux comptes ni envoyer de POST en production :

| Scénario injecté | Texte obtenu |
| --- | --- |
| `fetch` rejette avec une `TypeError` | Le serveur est inaccessible… |
| HTTP 401 avec message JSON | Identifiants incorrects |
| HTTP 403 sans message | Accès refusé. Déconnectez-vous puis reconnectez-vous. |
| HTTP 500 lisible | Erreur API 500 |
| HTTP 502 HTML lisible | Erreur API 502 |
| HTTP 200 avec JSON invalide | Message de SyntaxError, pas « serveur inaccessible » |
| `TypeError` lors de la lecture du corps | Le serveur est inaccessible… |
| Réponse JSON de succès | Succès |

Ces simulations vérifient le classement des erreurs, pas leur occurrence sur les téléphones. Un rejet réseau peut notamment provenir d'un échec DNS/TLS, d'une connexion interrompue ou d'un blocage CORS. Même une réponse 502 peut devenir illisible pour JavaScript si elle manque les en-têtes CORS attendus, et alors apparaître comme un échec réseau. Références : [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch), [lecture JSON](https://developer.mozilla.org/en-US/docs/Web/API/Response/json).

Le bundle public a été revérifié : bonne URL HTTPS de l'API et même texte. Le précontrôle du login avec `content-type,authorization` répond 200 et autorise l'origine officielle ainsi que les deux en-têtes.

Précision essentielle : les 104 réponses 401/403 ne prouvent donc pas la cause du texte exact « serveur inaccessible » au login. Elles concernent une autre famille d'erreurs, que certains écrans livreur/admin peuvent présenter comme un problème de connexion.

## Audit approfondi dans un navigateur — fichiers publiés

Exécuté le 19 septembre vers 22:12–22:16 UTC dans deux sessions Chromium isolées avec `agent-browser`. L'application testée est le frontend public Render, pas une reconstruction locale. Les parcours authentifiés utilisent un jeton fictif, des réponses API remplacées dans le navigateur et des listes vides : aucune session réelle ni donnée métier n'est utilisée. Une tentative de login avec des identifiants fictifs a également reçu le message attendu « Téléphone ou mot de passe incorrect. ». Aucun code applicatif ni réglage de production modifié.

### Résultats reproduits

| Essai | Observation | Portée |
| --- | --- | --- |
| Rejet `TypeError` du login simulé | Message exact « Le serveur est inaccessible… » | Confirme le chemin d'affichage dans le vrai navigateur |
| Login simulé réussi, première lecture livreur échouée, puis événement navigateur `online` et événement SSE `ready` | Aucune nouvelle lecture de données ; erreur toujours affichée | Le retour réseau et le rétablissement du flux ne resynchronisent pas seuls la page |
| Après ce défaut, émission SSE `refresh` et réponses page/compteurs réussies | Deux lectures effectuées, mais le message d'échec reste affiché | Faux état d'échec persistant après succès |
| Fermeture du flux SSE, réseau simulé fonctionnel | Nouvelle connexion SSE après environ deux secondes, sans lecture page/compteurs | La reconnexion du transport fonctionne ; le rattrapage de données manque |
| Blocage du téléchargement `DriverPage-BGnSLKEa.js`, puis login simulé réussi | Racine React vide, page blanche ; lever le blocage et envoyer `online` ne rétablit pas l'écran | Défaut supplémentaire : aucun traitement de l'échec de chargement différé, ni Error Boundary. Une coupure au mauvais moment peut rendre l'app inutilisable jusqu'au rechargement |
| Session locale contenant un JSON invalide, puis rechargement | Racine React vide, page blanche | `getAuth` parse sans protection. Défaut de robustesse confirmé, mais aucune preuve de session corrompue chez les utilisateurs |
| Requête login simulée restant en attente | « Connexion… » et bouton désactivé, toujours présents après l'événement `online` et trois secondes d'observation | Le code n'impose aucun délai maximal ; le test n'est pas une mesure du délai réseau réel du navigateur |

Les deux essais de page blanche ne reproduisent ni le texte exact « serveur inaccessible » ni la page hors ligne de Chrome : ce sont des défauts distincts qu'il ne faut pas confondre avec la photo.

### Contrôles complémentaires

- Aucun Service Worker enregistré dans le profil de test neuf ; aucun Service Worker, manifeste PWA ou écran « Vous êtes hors connexion » identifié dans les sources examinées. Cela ne permet pas d'inspecter les anciens caches des téléphones distants.
- L'icône violette visible sur la photo correspond à l'icône `public/favicon.svg` de l'app. Elle peut donc être reprise par l'écran hors ligne du navigateur ; ce n'est pas un indicateur de panne Render.
- HTML et chunk livreur actuels répondent HTTP 200 avec les bons types MIME. Cache annoncé : `public, max-age=0, s-maxage=300`. Aucun fichier actuellement manquant n'a été constaté ; le blocage de chunk était volontairement injecté.
- Un vrai `fetch` cross-origin vers `/api/packages/driver-view/page`, sans authentification et avec `Content-Type: application/json`, reçoit un 403 lisible dans le navigateur. CORS fonctionne pour cette route depuis le frontend officiel.
- Un `fetch` cross-origin vers `/actuator/health` échoue dans le navigateur, ce qui correspond à la configuration CORS limitée à `/api/**`. L'app actuelle n'appelle pas cette route ; ce contrôle ne constitue donc pas une cause des symptômes. L'ouverture directe de l'URL de santé reste un test différent, sans cette contrainte cross-origin.

### Conclusion de cet approfondissement

L'app présente des défauts démontrés qui prolongent ou rendent mal compréhensible une interruption et peuvent provoquer une page blanche. Aucun essai n'a montré que le code déclenche spontanément une coupure réseau ou l'écran hors ligne de Chrome. L'origine du premier échec sur les téléphones reste non attribuée.

Priorités complémentaires : gérer les erreurs d'import différé avec une récupération explicite, valider/protéger le stockage de session, puis tester les transitions réseau et session avant toute mise en production des corrections. Ne pas implémenter un mode hors ligne d'écriture de colis sans définir sa synchronisation et la gestion des conflits.
