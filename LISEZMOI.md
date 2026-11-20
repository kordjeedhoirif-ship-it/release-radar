# Release Radar — mise en ligne (gratuite, mise à jour automatique)

Le site se met à jour **tout seul 4 fois par jour**, sans crédit et sans abonnement :
un robot GitHub (GitHub Actions) récupère les vraies sorties sur Deezer, Apple Music et MusicBrainz,
trouve leurs **vraies pochettes**, puis écrit le fichier `data/releases.json` que le site affiche.

## Installation (une seule fois, ~10 minutes)

1. Crée un compte gratuit sur https://github.com, puis un **nouveau dépôt public** (ex. `release-radar`).
2. Dans le dépôt : **Add file → Upload files**, et glisse **tout le contenu** de ce dossier
   (`index.html`, `LISEZMOI.md`, les dossiers `data`, `scripts` et `.github`).
   ⚠️ Le dossier `.github` est caché sur Mac/Windows : si l'envoi par glisser-déposer l'oublie,
   crée le fichier à la main : **Add file → Create new file**, nom `.github/workflows/update.yml`,
   et colle le contenu du fichier `update.yml`.
3. **Settings → Actions → General → Workflow permissions** : coche **Read and write permissions** → Save.
4. Onglet **Actions** → « Mise à jour des sorties » → **Run workflow** (premier remplissage, 5 à 15 min).
5. **Settings → Pages** → Source : **Deploy from a branch** → branche `main`, dossier `/ (root)` → Save.
6. Ton site est en ligne à l'adresse `https://TON-PSEUDO.github.io/release-radar/` (1 à 2 minutes après).

Ensuite tu n'as plus rien à faire : le robot tourne seul toutes les 6 heures.

## Bon à savoir

- Seules les sorties des **6 derniers mois** et des **4 prochains mois** sont gardées, et uniquement
  celles qui ont une vraie pochette.
- Sorties à venir : dates annoncées publiquement (MusicBrainz, précommandes Apple). Elles peuvent changer.
- GitHub met en pause les tâches planifiées d'un dépôt resté inactif 60 jours. Si un jour la date
  « mise à jour il y a… » vieillit trop, va dans **Actions** et réactive le workflow.
- Ouvrir `index.html` directement sur ton ordinateur fonctionne aussi : le site se connecte alors
  en direct aux sources (un peu plus lent, sans les pochettes complétées par le robot).
