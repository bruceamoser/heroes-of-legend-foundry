import { test } from "node:test";
import assert from "node:assert/strict";
import {
  additionalLanguageOptions,
  COMMON_LANGUAGE_ID,
  DEFAULT_LANGUAGES,
  LANGUAGE_CONFIGURATION_SCHEMA,
  campaignLanguageOptions,
  createDefaultLanguageConfiguration,
  editorLanguageDefinitions,
  languageConfigurationBasis,
  validateLanguageConfiguration,
} from "../src/rules/languages.mjs";
import { languageGrants } from "../src/rules/identity.mjs";

const configuration = () => {
  const result = createDefaultLanguageConfiguration();
  result.definitions.find(
    (definition) => definition.id === COMMON_LANGUAGE_ID,
  ).name = "Marsh Common";
  return result;
};

const withReferenceLanguages = (result = configuration()) => {
  result.definitions.push(
    {
      id: "reed-speech",
      name: "Reed Speech",
      ordinary: true,
      form: "spoken",
      writing: true,
    },
    {
      id: "river-speech",
      name: "River Speech",
      ordinary: true,
      form: "spoken",
      writing: true,
    },
  );
  return result;
};

test("default campaign configuration retains the original source list", () => {
  const result = validateLanguageConfiguration(
    createDefaultLanguageConfiguration(),
  );
  assert(result.valid);
  assert.deepEqual(
    result.definitions.map((language) => language.id),
    [
      "common",
      "dwarven",
      "elven",
      "halfling",
      "goblin",
      "orc",
      "giant",
      "kobold",
      "harbor-cant",
      "way-sign",
      "draconic",
      "fey",
      "infernal",
      "celestial",
      "elemental",
    ],
  );
});

test("configuration rejects malformed entries, duplicates and invalid Common baselines", () => {
  const malformed = configuration();
  malformed.definitions[1].id = "Not Stable";
  malformed.definitions[2].name = " ";
  malformed.definitions[3].ordinary = "yes";
  malformed.definitions[4].form = "written";
  malformed.definitions[5].writing = 1;
  const malformedResult = validateLanguageConfiguration(malformed);
  assert(!malformedResult.valid);
  for (const code of [
    "language-id",
    "language-name",
    "language-availability",
    "language-form",
    "language-writing",
  ])
    assert(malformedResult.errors.some((error) => error.code === code));

  const duplicate = configuration();
  duplicate.definitions.push({ ...duplicate.definitions[1] });
  const duplicateResult = validateLanguageConfiguration(duplicate);
  assert(
    duplicateResult.errors.some(
      (error) => error.code === "duplicate-language-id",
    ),
  );
  assert(
    duplicateResult.errors.some(
      (error) => error.code === "duplicate-language-name",
    ),
  );

  const notOrdinary = configuration();
  notOrdinary.definitions.find(
    (definition) => definition.id === COMMON_LANGUAGE_ID,
  ).ordinary = false;
  assert(
    validateLanguageConfiguration(notOrdinary).errors.some(
      (error) => error.code === "common-ordinary",
    ),
  );

  assert(
    validateLanguageConfiguration({
      schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
      definitions: [{ ...DEFAULT_LANGUAGES[0] }],
    }).valid,
  );
});

test("all language options remain visible, eligible-first and precisely unavailable", () => {
  const current = configuration();
  const options = campaignLanguageOptions(current.definitions, {
    home: "removed-home",
    extraSpoken: ["way-sign", "removed-extra"],
  });
  assert.equal(options.home.length, current.definitions.length + 1);
  const homeEligibility = options.home.map((option) => option.eligible);
  assert.equal(
    homeEligibility.findLastIndex(Boolean) <
      homeEligibility.findIndex((eligible) => !eligible),
    true,
  );
  const common = options.home.find(
    (option) => option.id === COMMON_LANGUAGE_ID,
  );
  assert.equal(common.disabled, true);
  assert.match(common.reason, /already granted as Common/);
  const uncommon = options.home.find((option) => option.id === "draconic");
  assert.equal(uncommon.disabled, true);
  assert.match(uncommon.reason, /uncommon/);
  const removedHome = options.home.find(
    (option) => option.id === "removed-home",
  );
  assert.equal(removedHome.selected, true);
  assert.equal(removedHome.disabled, true);
  assert.equal(removedHome.repair, true);
  assert.match(removedHome.reason, /no longer defined/);
  const selectedCommon = campaignLanguageOptions(current.definitions, {
    home: "common",
  }).home.find((option) => option.id === "common");
  assert.equal(selectedCommon.disabled, true);
  assert.equal(selectedCommon.repair, true);

  const signedExtra = options.extraSpoken.find(
    (option) => option.id === "way-sign",
  );
  assert.equal(signedExtra.selected, true);
  assert.equal(signedExtra.repair, true);
  assert.match(signedExtra.reason, /signed/);
  assert(
    options.extraSpoken
      .filter((option) => !option.eligible)
      .every((option) => option.disabled || option.selected),
  );
  const repaired = campaignLanguageOptions(current.definitions, {
    home: "removed-home",
    extraSpoken: ["removed-extra"],
  }).extraSpoken.find((option) => option.id === "way-sign");
  assert.equal(repaired.selected, false);
  assert.equal(repaired.disabled, true);
  assert.equal(repaired.repair, false);
  assert.match(repaired.reason, /signed/);
});

test("duplicate home and extra selections are ineligible and repairable", () => {
  const current = configuration();
  const options = campaignLanguageOptions(current.definitions, {
    home: "dwarven",
    extraSpoken: ["dwarven", "way-sign"],
  });
  const duplicateHome = options.home.find((option) => option.id === "dwarven");
  assert.equal(duplicateHome.selected, true);
  assert.equal(duplicateHome.eligible, false);
  assert.equal(duplicateHome.disabled, true);
  assert.match(duplicateHome.reason, /already selected as an extra/);

  const duplicateExtra = options.extraSpoken.find(
    (option) => option.id === "dwarven",
  );
  assert.equal(duplicateExtra.selected, true);
  assert.equal(duplicateExtra.eligible, false);
  assert.equal(duplicateExtra.disabled, false);
  assert.equal(duplicateExtra.repair, true);
  assert.match(duplicateExtra.reason, /already selected as your home/);

  const afterUncheck = campaignLanguageOptions(current.definitions, {
    home: "dwarven",
    extraSpoken: ["way-sign"],
  }).extraSpoken.find((option) => option.id === "dwarven");
  assert.equal(afterUncheck.selected, false);
  assert.equal(afterUncheck.eligible, false);
  assert.equal(afterUncheck.disabled, true);
});

test("custom definitions drive spoken and signed grants without literacy leakage", () => {
  const current = withReferenceLanguages();
  const river = languageGrants(
    {
      home: "river-speech",
      extraSpoken: ["reed-speech", "dwarven"],
    },
    ["trait-human-many-homes"],
    current.definitions,
  );
  assert(river.valid);
  assert.equal(river.languages[0].name, "Marsh Common");
  assert.equal(river.languages[1].name, "River Speech");
  assert(river.languages[1].permissions.read);
  assert(!river.languages[2].permissions.read);
  assert(river.languages[2].permissions.speak);

  const signed = languageGrants({ home: "way-sign" }, [], current.definitions);
  assert(signed.valid);
  assert(signed.languages[1].permissions.sign);
  assert(!signed.languages[1].permissions.speak);

  assert(
    !languageGrants(
      { home: "river-speech", extraSpoken: ["way-sign", "reed-speech"] },
      ["trait-human-many-homes"],
      current.definitions,
    ).valid,
  );
});

test("configuration basis changes when definitions change", () => {
  const current = withReferenceLanguages();
  const first = languageConfigurationBasis(current);
  assert.equal(first, languageConfigurationBasis(structuredClone(current)));
  const changed = structuredClone(current);
  changed.definitions.find(
    (definition) => definition.id === "river-speech",
  ).name = "River Cant";
  assert.notEqual(first, languageConfigurationBasis(changed));
});

test("the GM editor preserves invalid saved shapes for explicit repair", () => {
  const raw = {
    schemaVersion: LANGUAGE_CONFIGURATION_SCHEMA,
    definitions: [
      {
        id: "common",
        name: "Common",
        ordinary: "false",
        form: "written",
        writing: 1,
      },
    ],
  };
  const rows = editorLanguageDefinitions(raw);
  assert.equal(rows[0].ordinary, false);
  assert.equal(rows[0].ordinaryInvalid, true);
  assert.equal(rows[0].form, "written");
  assert.equal(rows[0].formInvalid, true);
  assert.equal(rows[0].writing, false);
  assert.equal(rows[0].writingInvalid, true);
  assert(!validateLanguageConfiguration(raw).valid);
});

test("additional language options put legal choices first and retain blocked and own-source choices", () => {
  const known = [
    { id: "common", source: "creation-common" },
    { id: "goblin", source: "play" },
    { id: "orc", source: "ability-another-tongue" },
  ];
  const rows = additionalLanguageOptions(
    DEFAULT_LANGUAGES,
    known,
    "orc",
    "ability-another-tongue",
  );
  const firstBlocked = rows.findIndex((row) => row.disabled);
  assert(firstBlocked > 0);
  assert(rows.slice(0, firstBlocked).every((row) => row.eligible));
  assert(rows.slice(firstBlocked).every((row) => row.disabled));
  assert.equal(rows.find((row) => row.id === "goblin").disabled, true);
  assert.match(rows.find((row) => row.id === "goblin").reason, /already known/);
  assert.equal(rows.find((row) => row.id === "draconic").disabled, true);
  assert.match(rows.find((row) => row.id === "draconic").reason, /uncommon/);
  assert.equal(rows.find((row) => row.id === "orc").eligible, true);
  assert.equal(rows.find((row) => row.id === "orc").selected, true);
  const removed = additionalLanguageOptions(
    DEFAULT_LANGUAGES,
    known,
    "lost",
    "ability-another-tongue",
  ).find((row) => row.id === "lost");
  assert.equal(removed.selected, true);
  assert.equal(removed.disabled, true);
  assert.equal(removed.repair, true);
});
