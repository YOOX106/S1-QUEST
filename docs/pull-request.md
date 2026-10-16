Les modules du site existant deviennent un parcours de révision prérempli : les chapitres et séries regroupent 454 petites missions Cours, TD et TP issues du catalogue fourni. Les 17 bonus restent séparés de l’objectif principal par défaut ; Méthodologie reste à configurer.

- Ajouter les accordéons, filtres, prochaine mission, états de compréhension et navigation vers les TD proposés.
- Conserver tâches personnelles, profil, personnalisations et ancien historique grâce à une migration sauvegardée vers le schéma 3. Une ancienne validation de chapitre ne termine pas automatiquement ses enfants.
- Ajouter export/import confirmé et association locale des liens PDF privés. Aucun vrai lien Drive privé ni PDF n’est inclus dans cette PR.

Validation : les 112 tests Node/Chromium ont été relancés avant l’envoi, avec 112 réussites et aucun échec. Voir TESTS.md, les captures et docs/phase-b-livraison.md.

Les PDF réels et leurs permissions n’ont pas été vérifiés dans cet environnement. Le contenu académique conserve les réserves du catalogue fourni. Les phases C et IA restent à développer.

Cette PR vise uniquement la revue des phases A/B : aucune fusion ni modification de configuration de déploiement n’est effectuée.
