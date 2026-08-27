-- Tutto Bene — Supabase-Setup für Bewertungen & Favoriten (E9)
--
-- Dieses Skript einmalig im Supabase-Dashboard ausführen:
-- Projekt öffnen → "SQL Editor" (linke Seitenleiste) → "New query" →
-- diesen gesamten Text einfügen → "Run".
--
-- Was hier passiert: zwei Tabellen anlegen (ratings, favorites),
-- Row Level Security (RLS) aktivieren und Zugriffsregeln setzen.
-- Bewertungen sind bewusst komplett offen (siehe Spec E9, Abschnitt 2
-- "Absicherung" — kein echtes Login, Seite nicht öffentlich beworben).
-- Favoriten sind zusätzlich abgesichert: jede Zeile ist nur für die
-- eigene user_email lesbar (Spec E9, Abschnitt 3).

-- ────────────────────────────────────────────────────────────
-- Tabelle: ratings
-- ────────────────────────────────────────────────────────────

create table if not exists ratings (
  recipe_id text not null,
  user_email text not null,
  display_name text not null,
  stars numeric(2, 1) not null check (stars >= 1.0 and stars <= 5.0 and mod(stars * 10, 5) = 0),
  comment text,
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_email)
);

alter table ratings enable row level security;

-- Lesen: für alle offen, auch ohne Anmeldung (Bewertungen sind öffentlich).
create policy "ratings_select_all"
  on ratings for select
  using (true);

-- Einfügen: offen, jeder kann mit einer beliebigen E-Mail eine Bewertung anlegen
-- (bewusst niedrige Absicherung, siehe Spec E9 Abschnitt 2).
create policy "ratings_insert_all"
  on ratings for insert
  with check (true);

-- Ändern: offen, ein erneutes Bewerten überschreibt die eigene Zeile
-- (das Frontend macht ein "upsert" auf recipe_id + user_email).
create policy "ratings_update_all"
  on ratings for update
  using (true)
  with check (true);

-- Löschen: nur die eigene Zeile. Ursprünglich bewusst nicht vorgesehen
-- (Spec E9 Abschnitt 8), auf Wunsch nachgerüstet, damit eine versehentlich
-- abgegebene Bewertung wieder entfernt werden kann. Fremde Bewertungen
-- bleiben weiterhin nicht löschbar.
create policy "ratings_delete_own"
  on ratings for delete
  using (user_email = current_setting('request.headers', true)::json->>'x-user-email');

-- ────────────────────────────────────────────────────────────
-- Tabelle: favorites
-- ────────────────────────────────────────────────────────────

create table if not exists favorites (
  recipe_id text not null,
  user_email text not null,
  primary key (recipe_id, user_email)
);

alter table favorites enable row level security;

-- Lesen: NUR die eigene Zeile. Die Seite schickt die eigene E-Mail als
-- Anfrage-Header "x-user-email" mit (siehe ratings.js) — die Policy
-- vergleicht das mit der gespeicherten user_email.
create policy "favorites_select_own"
  on favorites for select
  using (user_email = current_setting('request.headers', true)::json->>'x-user-email');

-- Einfügen: nur mit der eigenen E-Mail im Header.
create policy "favorites_insert_own"
  on favorites for insert
  with check (user_email = current_setting('request.headers', true)::json->>'x-user-email');

-- Löschen (Favorit entfernen): nur die eigene Zeile.
create policy "favorites_delete_own"
  on favorites for delete
  using (user_email = current_setting('request.headers', true)::json->>'x-user-email');

-- ────────────────────────────────────────────────────────────
-- Hinweis zum "x-user-email"-Header
-- ────────────────────────────────────────────────────────────
--
-- Das ist KEINE echte Authentifizierung — der Header wird vom Frontend
-- selbst gesetzt und lässt sich beliebig fälschen (Browser-Konsole,
-- curl, …). Er verhindert nur, dass die normale Bedienung der Seite
-- (Karten laden, eigene Favoriten anzeigen) versehentlich fremde
-- Favoriten mit ausliefert. Das entspricht der bewussten Entscheidung
-- aus Spec E9: kein echtes Login, informelle Absicherung, weil die
-- Seite nicht öffentlich beworben wird.
--
-- Technisch wird der Header über die Supabase-Client-Option
-- `global.headers` bei jeder Anfrage mitgeschickt (siehe ratings.js).

-- ────────────────────────────────────────────────────────────
-- Fertig. Zum Prüfen:
-- ────────────────────────────────────────────────────────────
-- select * from ratings;
-- select * from favorites;
