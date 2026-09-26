# EIP Meet

Outil d'équipe pour planifier des réunions sans remplir un sondage à chaque fois.
Chacun renseigne une fois ses indisponibilités récurrentes ; EIP Meet trouve les
créneaux qui vont à tout le monde, quel que soit le fuseau horaire.

## Fonctionnement

### Mon calendrier (vue principale)
- On y saisit ses **indisponibilités** : « Indisponible » ou « Si besoin (à éviter) ».
  Tout ce qui n'est pas indisponible est considéré comme disponible.
- Glisser sur le calendrier (ou cliquer) pour en créer une, les heures se saisissant à la
  minute près ; ponctuelle ou récurrente :
  tous les jours, toutes les N semaines (jours au choix), tous les mois, avec une date
  de fin optionnelle.
- Modifier / supprimer une occurrence comme dans Apple Calendar : **cet événement /
  celui-ci et les suivants / tous**.
- Les réunions auxquelles on participe apparaissent en bandeau (atténué) sur leur période.
- Le fuseau horaire du compte se règle dans le menu utilisateur.

### Réunions
- Une réunion = une **période** (date min → max), une **durée** saisie librement (heures +
  minutes, de 5 min à 12h) et une plage horaire affichée (en heure locale de chacun).
- **Calcul à la minute près** : une personne n'est comptée disponible pour une réunion de 2h
  commençant à 9h que si elle l'est de 9h à 11h. Un membre libre à partir de 8h15 est pris en
  compte à 8h15. La réunion doit aussi tenir entièrement dans la plage horaire affichée.
- **Membres** : des comptes, invités par email (même avant leur première connexion).
  Leurs dispos sont **calculées depuis leur calendrier** : ils n'ont rien à remplir.
- **Invités sans compte** : chacun reçoit un lien personnel `/g/<token>` et peint ses
  dispos (« Dispo » / « Si besoin ») sur une grille dont il choisit le pas : 15 min, 30 min
  (par défaut) ou 1h. Ses dispos sont enregistrées comme des plages horaires : changer de
  pas ne perd rien. Glisser sur des créneaux déjà peints du même type les efface.
- **Rôles** : le créateur est admin et peut nommer d'autres admins. Les admins gèrent les
  paramètres, les membres et les invités (popup « Participants ») ; seul le créateur
  supprime la réunion.

### Lecture des résultats
Sur une réunion, seuls les **résultats** sont mis en avant, positionnés à la minute près :
- **✓ sur fond vert foncé** : la plage dans laquelle la réunion tient avec tout le monde
  « Dispo » (ex. 8h15 - 10h15).
- **✓ sur fond jaune** : tout le monde est disponible, dont au moins un « si besoin ».
- Sinon, un **liseré** atténué à gauche : orange = il manque 1 personne, rouge = il en
  manque plus.
- **Survol** : pour une réunion commençant à l'heure survolée (par pas de 5 min), statut de
  chaque personne sur toute la durée et l'heure que c'est chez elle.
- Onglet **Créneaux possibles** : plages dans lesquelles la réunion peut se placer, triées
  de la plus proche à la plus lointaine, filtrables par nombre minimum de participants.
- Vos propres indispos y restent discrètes (hachure légère) : elles se gèrent dans votre
  calendrier. Un invité voit sa propre peinture, qu'il modifie sur sa page.

### Fuseaux horaires
Tout est stocké en instants absolus (UTC) et réaffiché dans le fuseau de celui qui regarde.
Les indisponibilités récurrentes sont exprimées en heure locale de leur auteur (changements
d'heure gérés).

## Stack

Next.js 15 (App Router, TypeScript) · Mantine 7 · FullCalendar 6 (calendrier perso) ·
Auth.js v5 (Google / Microsoft Entra ID) · Prisma + SQLite · Luxon.

## Configuration

Copier `.env.example` en `.env` puis renseigner :

| Variable | Rôle |
|---|---|
| `AUTH_SECRET` | Secret de session (`openssl rand -base64 32`) |
| `AUTH_URL` | URL publique, **en prod uniquement** (ex. `https://eip-meet.logi-it.com`) |
| `AUTH_TRUST_HOST` | `true` derrière un reverse proxy / en Docker |
| `MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Connexion Microsoft (app Entra ID du tenant) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Connexion Google (optionnel) |

Un fournisseur n'apparaît sur la page de connexion que si ses variables sont renseignées.

URLs de redirection à déclarer (`http://localhost:3000` en local) :
- Microsoft : `https://<domaine>/api/auth/callback/microsoft-entra-id`
- Google : `https://<domaine>/api/auth/callback/google`

## Développement

```bash
npm install
cp .env.example .env         # puis compléter
npx prisma migrate deploy    # crée / met à jour la base SQLite locale (prisma/dev.db)
npm run dev                  # http://localhost:3000
```

## Production (Docker)

```bash
docker compose up -d --build
```

- La base SQLite vit dans le volume Docker `logimeet-data` (nom historique conservé pour
  ne pas perdre les données), monté sur `/data`.
- Les migrations Prisma sont appliquées automatiquement au démarrage du conteneur.
- La GitHub Action `Docker` construit l'image à chaque push / PR et la publie sur
  `ghcr.io/eliotamn/eip-meet` (tags `latest`, `main`, SHA court, versions `v*`).

## Sécurité

- Aucun secret dans le dépôt : `.env`, bases SQLite et build sont ignorés par git.
- Liens invités : jetons aléatoires de 144 bits ; la page invité n'expose ni les emails
  des membres ni les liens des autres invités.
- Les titres des indisponibilités ne sont jamais partagés : une réunion ne voit que des
  plages « occupé » / « si besoin » sur sa période.

## Organisation du code

| Chemin | Contenu |
|---|---|
| `src/app/(app)/` | Pages connectées : calendrier (`/`), réunions (`/meetings/…`) |
| `src/app/g/[token]/` | Page invité (sans compte) |
| `src/app/api/` | Routes API (calendrier, réunions, membres, invités, profil) |
| `src/lib/recurrence.ts` | Expansion des indisponibilités récurrentes (exceptions, changements d'heure) |
| `src/lib/server.ts` | Droits d'accès aux réunions, intervalles occupés des membres |
| `src/lib/availability.ts` | Statuts par créneau et plages de créneaux possibles |
| `src/components/` | UI (calendrier perso, grille de réunion, formulaires…) |
| `prisma/` | Schéma et migrations |
