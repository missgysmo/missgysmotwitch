# missgysmotwitch — Overlay avatars

Overlay OBS d'avatars pour les viewers du chat Twitch. Chaque viewer actif dans le chat a un avatar personnalisable qui se balade sur le stream avec son pseudo, et qui réagit aux follows/subs/cheers/raids.

## Installation

```bash
npm install
cp .env.example .env
```

Remplis `.env` :
- `TWITCH_CHANNEL` : nom de ta chaîne (sans le `#`)
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` : voir ci-dessous

## Créer l'app Twitch (pour les events follow/sub/cheer/raid)

1. Va sur https://dev.twitch.tv/console/apps et crée une nouvelle app
2. Catégorie : "Website Integration" (ou équivalent)
3. Ajoute l'URL de redirection : `http://localhost:3000/auth/callback` (doit correspondre exactement à `TWITCH_REDIRECT_URI` dans `.env`)
4. Copie le **Client ID** et génère un **Client Secret**, mets-les dans `.env`

## Lancer le serveur

```bash
npm start
```

Le serveur affiche 3 liens :
- `http://localhost:3000/overlay/` — à ajouter en **Browser Source** dans OBS
- `http://localhost:3000/customize/` — à partager à tes viewers pour qu'ils personnalisent leur avatar
- `http://localhost:3000/auth` — à ouvrir **une fois** dans ton navigateur pour autoriser l'app à lire follows/subs/cheers/raids (connecte-toi avec ton compte de chaîne). Redémarre le serveur après.

## Ajouter l'overlay dans OBS

1. Sources → + → Browser Source
2. URL : `http://localhost:3000/overlay/`
3. Largeur/hauteur : celles de ta scène (ex. 1920x1080)
4. Coche "Actualiser le navigateur quand la scène devient active" si besoin

## Fonctionnement

- Un viewer qui écrit dans le chat voit son avatar apparaître et se balader à l'écran
- Après 10 min d'inactivité dans le chat, l'avatar disparaît
- Sans personnalisation, l'avatar prend une couleur par défaut (dérivée du pseudo) et une forme ronde
- Les follows/subs/cheers/raids déclenchent un petit popup d'annonce à côté de l'avatar concerné

## Déployer sur Railway

Pour que le serveur tourne en permanence sans avoir besoin de le lancer sur ton PC pendant le stream.

1. Va sur [railway.app](https://railway.app), crée un projet, choisis **Deploy from GitHub repo** et sélectionne ce repo (pousse-le sur GitHub d'abord si ce n'est pas déjà fait).
2. Railway détecte automatiquement le projet Node (`npm install` puis `npm start`) via `package.json`.
3. Dans l'onglet **Variables** du service, ajoute les mêmes variables que dans `.env` :
   - `TWITCH_CHANNEL`
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET`
   - `SETTINGS_PASSWORD`
   - `TWITCH_REDIRECT_URI` → mets l'URL Railway une fois générée, ex : `https://tonapp.up.railway.app/auth/callback`
   - `DATA_DIR` → `/data` (voir volume ci-dessous)
   - Ne mets pas `PORT`, Railway le fournit automatiquement.
4. **Ajoute un volume persistant** (onglet du service → *Volumes* → *New Volume*), monté sur `/data`. Sans ça, `data/avatars.json`, `data/settings.json` et `data/tokens.json` seraient effacés à chaque redeploy.
5. Une fois déployé, copie l'URL Railway (`https://tonapp.up.railway.app`) et :
   - Ajoute `https://tonapp.up.railway.app/auth/callback` dans les **OAuth Redirect URLs** de ton app sur [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) (en plus de l'URL localhost si tu veux garder le dev en local).
   - Dans OBS, remplace l'URL de la Browser Source par `https://tonapp.up.railway.app/overlay/`.
   - Ouvre `https://tonapp.up.railway.app/auth` une fois pour autoriser les events Twitch (follow/sub/cheer/raid).
   - Partage `https://tonapp.up.railway.app/customize/` à tes viewers.

Le serveur tourne alors en continu sur Railway ; plus besoin de le lancer localement pour streamer.

## Limites connues (v1)

- Pas de vérification que la personne qui personnalise sur `/customize` est bien propriétaire du pseudo Twitch (à durcir plus tard si abus)
- Le refresh automatique du token OAuth n'est pas encore géré : si les events s'arrêtent après plusieurs heures, repasse par `/auth`
- Le serveur doit tourner en local pendant le stream (pas encore d'hébergement distant)
