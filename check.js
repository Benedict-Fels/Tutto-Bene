#!/usr/bin/env node
/**
 * check.js — Prüfskript für Tutto Bene.
 *
 * Gehört nicht zur Seite. Von Hand aufrufen:
 *
 *     node check.js
 *
 * Prüft die zehn Regeln aus Spec E1, Abschnitt 7. Fehler bedeuten:
 * so darf es nicht ins Repo. Warnungen sind Dinge, die stimmen können,
 * aber jemand angeschaut haben sollte.
 *
 * Rückgabewert: 0 wenn kein Fehler, sonst 1.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RECIPES_DIR = path.join(ROOT, 'recipes');
const IMAGES_DIR = path.join(ROOT, 'images');
const LISTS_FILE = path.join(ROOT, 'data', 'lists.json');
const DB_FILE = path.join(ROOT, 'recipes.json');

const errors = [];
const warnings = [];

// Von main() befüllt, von checkIngredientList() gelesen (Zutaten- und Einheitenliste
// werden für recipe.ingredients ebenso wie für variant.extraIngredients gebraucht).
let ingredientNamesGlobal = new Set();
let unitsGlobal = new Set();

const error = (where, message) => errors.push({ where, message });
const warn = (where, message) => warnings.push({ where, message });

/** Pflichtfelder einer Rezeptdatei. `null` ist bei diesen Feldern kein gültiger Wert. */
const REQUIRED_FIELDS = [
  'id',
  'title',
  'summary',
  'image',
  'category',
  'cuisine',
  'servings',
  'prepTime',
  'cookTime',
  'restTime',
  'ingredients',
  'steps',
];

/** Felder, die in recipes.json und der Rezeptdatei übereinstimmen müssen (Regel 6). */
const CORE_FIELDS = [
  'id',
  'title',
  'summary',
  'image',
  'category',
  'cuisine',
  'prepTime',
  'cookTime',
  'restTime',
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    error(path.relative(ROOT, file), `Datei nicht lesbar oder kein gültiges JSON: ${err.message}`);
    return null;
  }
}

function main() {
  const lists = readJson(LISTS_FILE);
  const db = readJson(DB_FILE);
  if (!lists || !db) return finish();

  const categories = new Set(lists.categories || []);
  const cuisines = new Set(lists.cuisines || []);
  const units = new Set(lists.units || []);
  const tags = new Set(lists.tags || []);
  const ingredientNames = new Set(lists.ingredients || []);
  const spiceNames = new Set(lists.spices || []);
  ingredientNamesGlobal = ingredientNames;
  unitsGlobal = units;

  if (!Array.isArray(db.recipes)) {
    error('recipes.json', 'Feld "recipes" fehlt oder ist keine Liste.');
    return finish();
  }

  // --- Rezeptdateien einlesen ------------------------------------------------
  if (!fs.existsSync(RECIPES_DIR)) {
    error('recipes/', 'Ordner fehlt.');
    return finish();
  }

  const files = fs
    .readdirSync(RECIPES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  const recipes = [];
  const seenIds = new Map();

  for (const file of files) {
    const where = `recipes/${file}`;
    const recipe = readJson(path.join(RECIPES_DIR, file));
    if (!recipe) continue;

    recipes.push({ file, recipe });

    // Regel 1 — Pflichtfeld fehlt
    for (const field of REQUIRED_FIELDS) {
      if (recipe[field] === undefined || recipe[field] === null) {
        error(where, `Pflichtfeld "${field}" fehlt.`);
      }
    }

    // Regel 4 — id gegen Dateiname und gegen Doppelvergabe
    const expectedId = file.replace(/\.json$/, '');
    if (recipe.id && recipe.id !== expectedId) {
      error(where, `id "${recipe.id}" weicht vom Dateinamen "${expectedId}" ab.`);
    }
    if (recipe.id) {
      if (seenIds.has(recipe.id)) {
        error(where, `id "${recipe.id}" kommt schon in ${seenIds.get(recipe.id)} vor.`);
      } else {
        seenIds.set(recipe.id, where);
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(recipe.id)) {
        error(where, `id "${recipe.id}" darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.`);
      }
    }

    // Regel 2 — feste Listen
    if (recipe.category && !categories.has(recipe.category)) {
      error(where, `category "${recipe.category}" steht nicht in der Kategorienliste.`);
    }
    if (recipe.cuisine && !cuisines.has(recipe.cuisine)) {
      error(where, `cuisine "${recipe.cuisine}" steht nicht in der Küchenliste.`);
    }

    // tags — optional, aber wenn gesetzt: Liste aus fester Werteliste
    if (recipe.tags !== undefined && recipe.tags !== null) {
      if (!Array.isArray(recipe.tags)) {
        error(where, 'tags muss eine Liste sein.');
      } else {
        for (const t of recipe.tags) {
          if (!tags.has(t)) {
            error(where, `tag "${t}" steht nicht in der Tag-Liste in data/lists.json.`);
          }
        }
      }
    }

    // Zahlenfelder
    for (const field of ['servings', 'prepTime', 'cookTime', 'restTime']) {
      const value = recipe[field];
      if (typeof value === 'number') {
        if (value < 0) error(where, `${field} ist negativ.`);
      } else if (value !== undefined && value !== null) {
        error(where, `${field} muss eine Zahl sein, ist aber "${typeof value}".`);
      }
    }
    if (typeof recipe.servings === 'number' && !Number.isInteger(recipe.servings)) {
      error(where, 'servings muss eine ganze Zahl sein.');
    }

    // --- Zutaten -------------------------------------------------------------
    if (Array.isArray(recipe.ingredients)) {
      if (recipe.ingredients.length === 0) {
        error(where, 'ingredients ist leer, mindestens ein Eintrag ist Pflicht.');
      }
      checkIngredientList(recipe.ingredients, where, 'Zutat');
    } else if (recipe.ingredients !== undefined) {
      error(where, 'ingredients muss eine Liste sein.');
    }

    // --- Varianten (variants) -------------------------------------------------
    if (recipe.variants !== undefined && recipe.variants !== null) {
      if (!Array.isArray(recipe.variants)) {
        error(where, 'variants muss eine Liste sein.');
      } else {
        if (recipe.variants.length === 0) {
          error(where, 'variants ist leer — entweder weglassen oder mindestens eine Variante angeben.');
        }
        const seenVariantNames = new Set();
        for (const variant of recipe.variants) {
          if (!variant || typeof variant !== 'object') {
            error(where, 'Ein Eintrag in variants ist kein Objekt.');
            continue;
          }
          const label = variant.name ? `Variante "${variant.name}"` : 'Eine Variante';

          if (!variant.name || typeof variant.name !== 'string') {
            error(where, 'Eine Variante hat kein Feld "name".');
          } else {
            if (seenVariantNames.has(variant.name)) {
              error(where, `Variantenname "${variant.name}" kommt mehrfach vor.`);
            }
            seenVariantNames.add(variant.name);
          }

          // Zutaten: entweder eine vollständige Ersetzung (variant.ingredients —
          // ersetzt die Basiszutaten komplett, für Varianten mit eigenem Teig)
          // oder eine Ergänzung (variant.extraIngredients — wird an die
          // Basiszutaten angehängt, für einfache Zutat-Add-ons). Nicht beides.
          const hasFullIngredients = variant.ingredients !== undefined;
          const hasExtraIngredients = variant.extraIngredients !== undefined;
          if (hasFullIngredients && hasExtraIngredients) {
            error(where, `${label}: ingredients und extraIngredients gleichzeitig gesetzt — nur eines von beiden.`);
          } else if (hasFullIngredients) {
            if (!Array.isArray(variant.ingredients) || variant.ingredients.length === 0) {
              error(where, `${label}: ingredients muss eine Liste mit mindestens einem Eintrag sein.`);
            } else {
              checkIngredientList(variant.ingredients, where, `Zutat bei ${label}`);
            }
          } else if (hasExtraIngredients) {
            if (!Array.isArray(variant.extraIngredients)) {
              error(where, `${label}: extraIngredients muss eine Liste sein.`);
            } else {
              checkIngredientList(variant.extraIngredients, where, `Zusatzzutat bei ${label}`);
            }
          } else {
            error(where, `${label}: weder "ingredients" noch "extraIngredients" gesetzt (leere Liste [] bei extraIngredients, falls keine Zusatzzutaten).`);
          }

          // Schritte: gleiches Muster — variant.steps ersetzt komplett,
          // variant.extraSteps ergänzt die Basisschritte.
          const hasFullSteps = variant.steps !== undefined;
          const hasExtraSteps = variant.extraSteps !== undefined;
          if (hasFullSteps && hasExtraSteps) {
            error(where, `${label}: steps und extraSteps gleichzeitig gesetzt — nur eines von beiden.`);
          } else if (hasFullSteps) {
            if (!Array.isArray(variant.steps) || variant.steps.length === 0) {
              error(where, `${label}: steps muss eine Liste mit mindestens einem Eintrag sein.`);
            } else {
              variant.steps.forEach((step, index) => {
                if (typeof step !== 'string') {
                  error(where, `${label}: Schritt ${index + 1} ist kein Text.`);
                }
              });
            }
          } else if (hasExtraSteps) {
            if (!Array.isArray(variant.extraSteps)) {
              error(where, `${label}: extraSteps muss eine Liste sein.`);
            } else {
              variant.extraSteps.forEach((step, index) => {
                if (typeof step !== 'string') {
                  error(where, `${label}: Extra-Schritt ${index + 1} ist kein Text.`);
                }
              });
            }
          } else {
            error(where, `${label}: weder "steps" noch "extraSteps" gesetzt (leere Liste [] bei extraSteps, falls keine Zusatzschritte).`);
          }

          // Optionale Zeit-/Portions-Overrides — nur wenn gesetzt, aber dann korrekt.
          for (const field of ['servings', 'prepTime', 'cookTime', 'restTime']) {
            const value = variant[field];
            if (value === undefined || value === null) continue;
            if (typeof value !== 'number' || value < 0) {
              error(where, `${label}: ${field} muss eine nichtnegative Zahl sein.`);
            } else if (field === 'servings' && !Number.isInteger(value)) {
              error(where, `${label}: servings muss eine ganze Zahl sein.`);
            }
          }

          // Optionale cuisine- und image-Overrides.
          if (variant.cuisine !== undefined && variant.cuisine !== null) {
            if (typeof variant.cuisine !== 'string' || !cuisines.has(variant.cuisine)) {
              error(where, `${label}: cuisine "${variant.cuisine}" steht nicht in der Küchenliste.`);
            }
          }
          if (variant.image !== undefined && variant.image !== null) {
            if (typeof variant.image !== 'string') {
              error(where, `${label}: image muss ein Text sein.`);
            } else {
              const variantImagePath = path.join(ROOT, variant.image);
              if (!fs.existsSync(variantImagePath)) {
                error(where, `${label}: Bilddatei fehlt: ${variant.image}`);
              }
            }
          }
        }
      }
    }

    // --- Gewürze (spices) -----------------------------------------------------
    if (recipe.spices !== undefined && recipe.spices !== null) {
      if (Array.isArray(recipe.spices)) {
        for (const ing of recipe.spices) {
          const label = ing && ing.name ? `Gewürz "${ing.name}"` : 'Ein Gewürz';

          if (!ing || typeof ing !== 'object') {
            error(where, 'Ein Eintrag in spices ist kein Objekt.');
            continue;
          }

          if (!ing.name) {
            error(where, 'Ein Eintrag in spices hat kein Feld "name".');
          } else if (!spiceNames.has(ing.name)) {
            error(where, `${label} steht nicht in der Gewürzliste (data/lists.json, Schlüssel "spices").`);
          }

          if (ing.unit !== null && ing.unit !== undefined && !units.has(ing.unit)) {
            error(where, `Einheit "${ing.unit}" bei ${label} steht nicht in der Einheitenliste.`);
          }

          const hasAmount = ing.amount !== null && ing.amount !== undefined;
          const hasUnit = ing.unit !== null && ing.unit !== undefined;
          if (hasAmount && typeof ing.amount !== 'number') {
            error(where, `amount bei ${label} muss eine Zahl sein.`);
          }
          if (hasAmount && !hasUnit) {
            error(where, `${label} hat eine Menge, aber keine Einheit.`);
          }
          if (!hasAmount && hasUnit) {
            error(where, `${label} hat eine Einheit, aber keine Menge — "nach Geschmack" braucht beides auf null.`);
          }

          if (ing.variety && spiceNames.has(ing.variety)) {
            error(
              where,
              `variety "${ing.variety}" bei ${label} steht zugleich als eigener Eintrag in der Gewürzliste. Entweder filterbar oder Vorliebe — nicht beides.`
            );
          }
        }
      } else {
        error(where, 'spices muss eine Liste sein.');
      }
    }

    // --- Schritte ------------------------------------------------------------
    if (Array.isArray(recipe.steps)) {
      if (recipe.steps.length === 0) {
        error(where, 'steps ist leer.');
      }
      recipe.steps.forEach((step, index) => {
        if (typeof step !== 'string') {
          error(where, `Schritt ${index + 1} ist kein Text.`);
          return;
        }
        // Regel 8 — Ziffer oder Einheit im Schritt (Warnung, Zeiten sind erlaubt)
        const unitPattern = new RegExp(
          `(^|[\\s(])(${[...units].map(escapeRegExp).join('|')})([\\s.,)]|$)`
        );
        if (/\d/.test(step) || unitPattern.test(step)) {
          warnings.push({
            where,
            message: `Schritt ${index + 1} enthält eine Zahl oder Einheit — bitte prüfen, ob es eine Zeit- oder Temperaturangabe ist: „${step}“`,
          });
        }
      });
    } else if (recipe.steps !== undefined) {
      error(where, 'steps muss eine Liste sein.');
    }

    // --- Quelle --------------------------------------------------------------
    if (recipe.source !== undefined && recipe.source !== null) {
      if (!recipe.source.name || !recipe.source.url) {
        error(where, 'source braucht sowohl "name" als auch "url".');
      }
    }

    // Regel 10 — Bilddatei vorhanden
    if (recipe.image) {
      const imagePath = path.join(ROOT, recipe.image);
      if (!fs.existsSync(imagePath)) {
        error(where, `Bilddatei fehlt: ${recipe.image}`);
      }
      const expectedImage = `images/${expectedId}.jpg`;
      if (recipe.image !== expectedImage) {
        warn(where, `image ist "${recipe.image}", erwartet war "${expectedImage}".`);
      }
    }
  }

  // --- Regel 5 und 6 — Abgleich mit recipes.json ------------------------------
  const dbById = new Map();
  for (const entry of db.recipes) {
    if (!entry || !entry.id) {
      error('recipes.json', 'Ein Eintrag hat keine id.');
      continue;
    }
    if (dbById.has(entry.id)) {
      error('recipes.json', `id "${entry.id}" kommt doppelt vor.`);
    }
    dbById.set(entry.id, entry);
  }

  for (const { file, recipe } of recipes) {
    if (!recipe.id) continue;
    const entry = dbById.get(recipe.id);
    if (!entry) {
      error('recipes.json', `Rezept "${recipe.id}" liegt in recipes/, fehlt aber in recipes.json.`);
      continue;
    }

    // Regel 6 — Kerndaten müssen übereinstimmen
    for (const field of CORE_FIELDS) {
      if (JSON.stringify(entry[field]) !== JSON.stringify(recipe[field])) {
        error(
          'recipes.json',
          `"${recipe.id}": Feld ${field} weicht ab — recipes.json hat ${JSON.stringify(entry[field])}, recipes/${file} hat ${JSON.stringify(recipe[field])}.`
        );
      }
    }

    // Zutatennamen müssen in gleicher Reihenfolge übereinstimmen
    const namesFromRecipe = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((i) => i && i.name)
      : [];
    if (JSON.stringify(entry.ingredients) !== JSON.stringify(namesFromRecipe)) {
      error(
        'recipes.json',
        `"${recipe.id}": Zutatenliste weicht ab — recipes.json hat ${JSON.stringify(entry.ingredients)}, recipes/${file} hat ${JSON.stringify(namesFromRecipe)}.`
      );
    }

    // Gewürznamen (spices) müssen ebenso in gleicher Reihenfolge übereinstimmen
    const spiceNamesFromRecipe = Array.isArray(recipe.spices)
      ? recipe.spices.map((i) => i && i.name)
      : [];
    const spiceNamesFromDb = Array.isArray(entry.spices) ? entry.spices : [];
    if (JSON.stringify(spiceNamesFromDb) !== JSON.stringify(spiceNamesFromRecipe)) {
      error(
        'recipes.json',
        `"${recipe.id}": Gewürzliste (spices) weicht ab — recipes.json hat ${JSON.stringify(spiceNamesFromDb)}, recipes/${file} hat ${JSON.stringify(spiceNamesFromRecipe)}.`
      );
    }

    if (entry.variety !== undefined) {
      error('recipes.json', `"${recipe.id}": variety gehört nicht in recipes.json.`);
    }

    // tags müssen übereinstimmen — fehlendes Feld gilt wie eine leere Liste
    const entryTags = entry.tags || [];
    const recipeTags = recipe.tags || [];
    if (JSON.stringify(entryTags) !== JSON.stringify(recipeTags)) {
      error(
        'recipes.json',
        `"${recipe.id}": tags weichen ab — recipes.json hat ${JSON.stringify(entryTags)}, recipes/${file} hat ${JSON.stringify(recipeTags)}.`
      );
    }
  }

  const idsOnDisk = new Set(recipes.map(({ recipe }) => recipe.id).filter(Boolean));
  for (const id of dbById.keys()) {
    if (!idsOnDisk.has(id)) {
      error('recipes.json', `Eintrag "${id}" steht in recipes.json, aber es gibt keine Datei recipes/${id}.json.`);
    }
  }

  // --- Verwaiste Bilder (Hinweis) --------------------------------------------
  if (fs.existsSync(IMAGES_DIR)) {
    const used = new Set(recipes.map(({ recipe }) => recipe.image).filter(Boolean));
    for (const name of fs.readdirSync(IMAGES_DIR)) {
      if (name.startsWith('.')) continue;
      if (!used.has(`images/${name}`)) {
        warn('images/', `${name} gehört zu keinem Rezept.`);
      }
    }
  }

  finish(recipes.length);
}

/**
 * Prüft eine Liste von Zutaten-Objekten (Regeln 2, 3, 7, 9 aus Spec E1).
 * Wird sowohl für recipe.ingredients als auch für variant.extraIngredients benutzt.
 * `ingredientNames` und `units` werden aus dem umschließenden main()-Scope erwartet.
 */
function checkIngredientList(list, where, labelPrefix) {
  for (const ing of list) {
    const label = ing && ing.name ? `${labelPrefix} "${ing.name}"` : `Eine ${labelPrefix.toLowerCase()}`;

    if (!ing || typeof ing !== 'object') {
      error(where, `Ein Eintrag (${labelPrefix}) ist kein Objekt.`);
      continue;
    }

    if (!ing.name) {
      error(where, `${labelPrefix} hat kein Feld "name".`);
    } else if (!ingredientNamesGlobal.has(ing.name)) {
      error(where, `${label} steht nicht in der Zutatenliste in data/lists.json.`);
    }

    if (ing.unit !== null && ing.unit !== undefined && !unitsGlobal.has(ing.unit)) {
      error(where, `Einheit "${ing.unit}" bei ${label} steht nicht in der Einheitenliste.`);
    }

    const hasAmount = ing.amount !== null && ing.amount !== undefined;
    const hasUnit = ing.unit !== null && ing.unit !== undefined;
    if (hasAmount && typeof ing.amount !== 'number') {
      error(where, `amount bei ${label} muss eine Zahl sein.`);
    }
    if (hasAmount && !hasUnit) {
      error(where, `${label} hat eine Menge, aber keine Einheit.`);
    }
    if (!hasAmount && hasUnit) {
      error(where, `${label} hat eine Einheit, aber keine Menge — "nach Geschmack" braucht beides auf null.`);
    }

    if (ing.variety && ingredientNamesGlobal.has(ing.variety)) {
      error(
        where,
        `variety "${ing.variety}" bei ${label} steht zugleich als eigener Eintrag in der Zutatenliste. Entweder filterbar oder Vorliebe — nicht beides.`
      );
    }
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function finish(count) {
  const line = '─'.repeat(60);

  if (warnings.length) {
    console.log(`\nHinweise (${warnings.length})`);
    console.log(line);
    for (const { where, message } of warnings) {
      console.log(`  ${where}: ${message}`);
    }
  }

  if (errors.length) {
    console.log(`\nFehler (${errors.length})`);
    console.log(line);
    for (const { where, message } of errors) {
      console.log(`  ${where}: ${message}`);
    }
    console.log(`\nTutto male. ${errors.length} Fehler.\n`);
    process.exit(1);
  }

  const zahl = count === undefined ? '' : ` ${count} Rezept${count === 1 ? '' : 'e'} geprüft,`;
  console.log(`\nTutto bene.${zahl} keine Fehler.\n`);
  process.exit(0);
}

main();
