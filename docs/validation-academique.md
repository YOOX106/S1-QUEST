# Validation académique — Phase B

Les trois pièces jointes définitives ont été lues avant l’implémentation. Le Master Prompt fixe le produit et la sécurité ; le JSON et les consignes fixent les titres et niveaux de confiance. La demande actuelle autorise explicitement le développement local des phases A/B ; elle n’autorise pas un déploiement, malgré la phrase de validation générale du fichier de consignes.

`curriculum.json` est une copie exacte du JSON fourni, sans réécriture académique. La normalisation à l’exécution conserve cette source sous `sourceCatalog` et ne change pas ses IDs. Les titres éditoriaux et les lectures de scans sont étiquetés dans les missions. Aucun OCR ou examen supplémentaire des vrais PDF n’a été exécuté pendant cette phase.

| Module | Cours | TD | TP | Total fourni |
| --- | ---: | ---: | ---: | ---: |
| Analyse 1 | 52 | 44 | — | 96 |
| Algèbre 1 | 30 | 33 | — | 63 |
| Algèbre 2 | 29 | 31 | — | 60 |
| Thermodynamique | 44 | 23 | — | 67 |
| Mécanique du point | 34 | 20 | — | 54 |
| Informatique 1 | 41 | 40 | 33 | 114 |
| Méthodologie | 0 | — | — | 0 |
| Total | 230 | 191 | 33 | 454 |

## Décisions documentées

- **Schéma de progression 3** : le code local audité utilisait déjà le schéma 2 pour les sept éléments parents d’Analyse 1. Réutiliser « 2 » avec une autre structure aurait introduit une ambiguïté. La migration accepte 1/2 vers 3 et sauvegarde le JSON brut avant remplacement. L’ancien historique reste séparé des nouvelles feuilles.
- **17 bonus** : sept exercices d’Analyse 1 sont explicitement `optional:true`. Le groupe fourni `informatique1-tpbonus` contient dix exercices sans indicateur `optional`, alors que son titre l’identifie comme bonus. En application de la règle du Master Prompt sur les compléments facultatifs, ils sont exclus de l’objectif principal par défaut. C’est une dérivation explicite dans le normaliseur, sans modification du JSON source. Chacun peut être inclus dans l’objectif personnel.
- **24 associations** : toutes restent proposées, y compris celles de confiance élevée dans le catalogue. La nouvelle source remplace les propositions plus limitées du catalogue antérieur ; aucun lien supplémentaire n’est supposé. Une même série garde le même ID et les mêmes états dans toutes les recommandations.
- **Thermodynamique** : les blocs de pages sont provisoires et ne sont pas présentés comme de véritables sous-titres académiques.
- **Algèbre 2 TD** : la lecture des exercices sur photos nécessite une vérification visuelle finale.
- **Mécanique** : `MDPM-chapitre5.pdf` est associé dans le catalogue au titre « Chapitre 6 : Chocs de deux particules ». L’interface signale cette divergence, sans renumérotation silencieuse.
- **Méthodologie** : aucun programme n’est fabriqué. La section Cours reste vide et personnalisable.
- **Sources** : 66 références, mais 63 couples module/nom de fichier ; il ne faut pas les présenter comme 66 fichiers uniques. Les répétitions de références ne sont pas des missions supplémentaires.
- **Pages** : seules les pages explicitement présentes et dans les limites de la source sont affichées, avec la mention « selon le catalogue ». Aucune page n’est inférée. Un lien Google Drive ouvre le document sans promettre un ancrage de page compatible.
- **Données manquantes** : les liens des autres modules ne sont pas inventés. « Associer un PDF » reste disponible. Les permissions et le contenu des PDF doivent être contrôlés par un utilisateur autorisé avant confirmation académique.

Les documents source restent une base préparatoire à valider, pas un programme officiel complet. Les durées sont des suggestions, aucun temps d’étude réel n’est calculé.
