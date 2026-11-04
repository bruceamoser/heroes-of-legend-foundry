#!/usr/bin/env python3
"""Read all six immutable worked examples; compare printed mechanics and ledgers.

No fixture overrides are consulted. The source-locked intake catalogs are used
only after verifying every relevant hash against the immutable released Git blobs.
Summary findings distinguish mechanical contradictions from abbreviated prose.
"""
import argparse
import collections
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("decision_audit", ROOT / "scripts/audit-decision-conformance.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def normal(value):
    return audit.visible(value).replace("’", "'").replace("— no roll", "(no roll)").rstrip(".")


def attr(value):
    return normal(value.split(";")[0]).replace(" (no roll)", "")


def line_of(text, fragment):
    index = text.index(fragment)
    return text[:index].count("\n") + 1


def sections(text):
    return {match[1]:match[2] for match in re.finditer(r"^## ([^\n]+)\n([\s\S]*?)(?=^## |\Z)", text, re.M)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository",type=Path,default=Path("/home/bmoser/repos/heroes-of-legend"))
    parser.add_argument("--output",type=Path,default=ROOT/"review/decision-audit-2026-11-03")
    args = parser.parse_args()
    blobs = audit.git_blobs(args.repository,audit.RELEASE)
    catalog = json.loads((ROOT/"static/data/choices.json").read_text())
    inventory = json.loads((ROOT/"static/data/inventory.json").read_text())
    assert catalog["sourceCommit"] == inventory["sourceCommit"] == audit.RELEASE
    records = catalog["records"]
    by_path = {record["source"]["path"]:record for record in records}
    by_id = {record["id"]:record for record in records}
    for record in records + inventory["equipment"] + inventory["recipes"]:
        assert blobs[record["source"]["path"]]["sha256"] == record["source"]["sha256"]
    for record in records:
        authored = blobs[record["source"]["path"]]["text"]
        if record["kind"] == "ancestry":
            hp,speed = map(int,re.search(r"HP \+(\d+); base Speed (\d+)",authored).groups())
            assert (record["hp"],record["speed"]) == (hp,speed)
        if record["kind"] == "class":
            assert record["hp"] == int(re.search(r"HP contribution \+(\d+)",authored)[1])
            home = re.search(r"Home: ([^.]+)\.",authored)
            adjacent = re.search(r"Adjacent: ([^.]+)\.",authored)
            if home and adjacent:
                for discipline in (value for value in records if value["kind"] == "discipline"):
                    expected_prices = [1,2,4] if discipline["name"] in home[1].split(", ") else [2,4,8] if discipline["name"] in adjacent[1].split(", ") else [3,6,12]
                    assert record["prices"][discipline["id"]] == expected_prices
        if record["kind"] in {"class","ancestry","origin"}:
            assert record["coins"] == int(re.search(r"\*\*Starting coin contribution:\*\* ([+-]?\d+) coins",authored)[1])
        if record["kind"] == "ability":
            source_fields = audit.parse_source(authored)
            if not record["universal"]:
                assert record["cost"] == int(source_fields["DP"])
            if not record.get("classId"):
                disciplines = [f"{by_id[requirement['id']]['name']} {requirement['rank']}" for requirement in record["requirements"] if requirement["kind"] == "discipline"]
                requirements = " and ".join(disciplines) or "None"
                if any(requirement["kind"] == "capability" for requirement in record["requirements"]):
                    requirements += "; a known compatible crafting ability"
                assert source_fields["Requirements"] in {requirements,requirements.replace("a known compatible crafting ability","known compatible crafting card")}
    for record in inventory["equipment"]:
        if record.get("grantOnly"):
            continue
        authored = blobs[record["source"]["path"]]["text"]
        assert record["price"] == int(re.search(r"\*\*Market price:\*\* (\d+) coins",authored)[1])
        assert record["bulk"] == int(re.search(r"\*\*Bulk:\*\* (\d+)",authored)[1])
    equipment = {record["id"]:record for record in inventory["equipment"]}
    acquisitions = {record["id"]:record for record in inventory["acquisitions"]}
    findings, heroes, checks = [], [], []

    def evidence(path, fragment=None):
        value = {"commit":audit.RELEASE,"path":path,"sha256":blobs[path]["sha256"]}
        if fragment:
            value["line"] = line_of(blobs[path]["text"],fragment)
        return value

    def check(hero, category, actual, expected, context):
        checks.append({"hero":hero,"category":category,"status":"match" if actual == expected else "mismatch","printed":actual,"current":expected,**context})
        return actual == expected

    def finding(hero, category, title, printed, current, reason, source, definitions, extra=None):
        findings.append({"id":f"WE-{len(findings)+1:03}","hero":hero,"category":category,"title":title,"printed":printed,"current":current,"reason":reason,"source":source,"definitions":definitions,"status":"mechanical-contradiction",**(extra or {})})

    paths = sorted(path for path in blobs if path.startswith("design/characters/") and not path.endswith("/README.md"))
    assert len(paths) == 6
    for path in paths:
        text = blobs[path]["text"]
        assert text.splitlines()[0].endswith("— level 1")
        hero = path.split("/")[-1][:-3]
        split = sections(text)
        class_name, class_slug = re.search(r"Choose \[([^\]]+)\]\(\.\./classes/([^)]+)\.md\)",text).groups()
        cls = by_path[f"design/classes/{class_slug}.md"]
        ancestry = next(record for record in records if record["kind"] == "ancestry" and text.splitlines()[4].startswith(f"**{record['name']} {class_name} ·"))
        values = next(line for line in text.splitlines() if re.fullmatch(r"\|(?: [+-]?\d+ \|){6}",line))
        attributes = dict(zip(["brawn","fortitude","agility","guile","knowledge","reason"],map(int,re.findall(r"[+-]?\d+",values))))
        check(hero,"attribute sum",sum(attributes.values()),3,{"source":evidence(path,values)})
        check(hero,"class minima",all(attributes[key] >= 0 for key in cls["minimumAttributes"]),True,{"class":cls["id"]})
        trait_links = re.findall(r"^- \[[^\]]+\]\(\.\./ancestries/([^)]*)\): ([^\n]+)",split["Attributes and ancestry"],re.M)
        trait_ids = [by_path[f"design/ancestries/{filename}"]["id"] for filename,_ in trait_links]
        check(hero,"two valid ancestry traits",len(trait_ids) == 2 and all(t in ancestry["traits"] for t in trait_ids),True,{"ancestry":ancestry["id"]})
        held_ranks, held_cards, origin_rows = {}, set(), []
        origin_duplicates = 0
        for origin_slug, discipline_name, card_slug in re.findall(r"^- \[[^\]]+\]\(\.\./origins/([^)]*)\): \*\*([^*]+) 1\*\* and \[[^\]]+\]\(\.\./cards/([^)]*)\)",text,re.M):
            origin = by_path[f"design/origins/{origin_slug}"]
            discipline = next(record for record in records if record["kind"] == "discipline" and record["name"] == discipline_name)
            card = by_path[f"design/cards/{card_slug}"]
            check(hero,"origin paired grants",any(pair["disciplineId"] == discipline["id"] and pair["abilityId"] == card["id"] for pair in origin["pairs"]),True,{"origin":origin["id"]})
            origin_duplicates += int(discipline["id"] in held_ranks) + int(card["id"] in held_cards)
            held_ranks[discipline["id"]] = 1
            held_cards.add(card["id"])
            origin_rows.append(origin)
        assert len(origin_rows) == 2
        mental = sum(attributes[key] for key in ["guile","knowledge","reason"])
        adaptable = int("trait-human-far-walker" in trait_ids)
        stages = []
        sig_slug = re.search(r"Free signature: \[[^\]]+\]\(\.\./cards/([^)]*)\)",text)[1]
        signature = by_path[f"design/cards/{sig_slug}"]
        check(hero,"free class signature",signature["id"] in cls["signatures"]["1"],True,{"signature":signature["id"]})
        check(hero,"universal reference inventory",len([record for record in records if record.get("universal")]),18,{"source":evidence(path,"All 18")})
        all_purchases = []
        for level in [0,1]:
            section = next(value for title,value in split.items() if title.startswith(f"Level {level} "))
            duplicate = origin_duplicates
            if level == 1:
                duplicate = 0
                for discipline in re.findall(r"Class grants \*\*([^*]+)\*\*",section)[0].split(" and "):
                    name, rank = discipline.rsplit(" ",1)
                    record = next(record for record in records if record["kind"] == "discipline" and record["name"] == name)
                    check(hero,"class rank grant eligible",record["id"] in cls["startingDisciplines"],True,{"discipline":record["id"]})
                    duplicate += int(record["id"] in held_ranks)
                    held_ranks[record["id"]] = int(rank)
                held_cards.add(signature["id"])
                printed_duplicates = re.search(r"; (\d+) duplicate\(s\) give \*\*\+(\d+) DP",section)
                check(hero,"class duplicate compensation",list(map(int,printed_duplicates.groups())),[duplicate,duplicate],{})
            pool = 10 + mental + adaptable + duplicate
            printed_pool = int(re.search(r"(?:Opening|Fresh) pool: \*\*[^\n]*?= (\d+) DP",section)[1])
            remaining = pool
            purchases, spent = [], 0
            for line in section.splitlines():
                if not line.startswith("| ") or not re.search(r"\| \d+ \| \d+ \|$",line):
                    continue
                cells = [part.strip() for part in line.strip("|").split("|")]
                printed_cost, printed_remaining = map(int,cells[-2:])
                link = re.search(r"\]\(\.\./cards/([^)]+)\)",cells[0])
                if link:
                    record = by_path[f"design/cards/{link[1]}"]
                    price = record["cost"]
                    for requirement in record["requirements"]:
                        if requirement["kind"] == "discipline":
                            check(hero,"ability prerequisites",held_ranks.get(requirement["id"],0) >= requirement["rank"],True,{"ability":record["id"],"stage":level})
                        elif requirement["kind"] == "capability":
                            check(hero,"compatible crafting prerequisite",bool(held_cards & {"ability-trail-workshop","ability-make-something-useful","ability-enchanting-workshop"}),True,{"ability":record["id"],"stage":level})
                    held_cards.add(record["id"])
                else:
                    name, rank = re.search(r"\*\*([^*]+) ([123])\*\*",cells[0]).groups()
                    record = next(record for record in records if record["kind"] == "discipline" and record["name"] == name)
                    price = 2 if level == 0 else cls["prices"][record["id"]][int(rank)-1]
                    check(hero,"discipline previous rank",held_ranks.get(record["id"],0),int(rank)-1,{"discipline":record["id"],"stage":level})
                    held_ranks[record["id"]] = int(rank)
                check(hero,"purchase price",printed_cost,price,{"record":record["id"],"stage":level,"source":evidence(path,line)})
                remaining -= price
                spent += price
                purchases.append({"id":record["id"],"currentPrice":price,"printedPrice":printed_cost,"currentRemaining":remaining,"printedRemaining":printed_remaining,"line":line_of(text,line)})
                check(hero,"running DP balance",printed_remaining,remaining,{"stage":level,"record":record["id"]})
                all_purchases.append(record["id"])
            closing = re.search(r"\*\*Spent (\d+); (\d+) DP expires",section)
            check(hero,"spent DP",int(closing[1]),spent,{"stage":level})
            stage = {"level":level,"mentalBase":10+mental,"adaptableBonus":adaptable,"duplicateCompensation":duplicate,"printedPool":printed_pool,"currentPool":pool,"spent":spent,"printedExpired":int(closing[2]),"currentExpired":remaining,"purchases":purchases}
            stages.append(stage)
            if printed_pool != pool or int(closing[2]) != remaining:
                finding(hero,"DP ledger",f"Level {level} omits Adaptable DP",{"pool":printed_pool,"expired":int(closing[2])},{"pool":pool,"expired":remaining},"Adaptable grants +1 DP at each level including level 0. Every displayed running balance is one lower; the unused point expires separately at each stage, without changing the listed spending.",evidence(path,re.search(r"(?:Opening|Fresh) pool: [^\n]+",section)[0]),[evidence("design/ancestries/trait-human-far-walker.md"),evidence("design/development.md")],{"purchases":purchases})

        # The complete printed checklist is independently compared with current card metadata.
        checklist = split["Complete learned-card checklist"]
        checklist_ids = []
        for match in re.finditer(r"^- \[([^\]]+)\]\(\.\./cards/([^)]+)\) — ([^;]+); ([^\n]+)",checklist,re.M):
            label, slug, action, attribute = match.groups()
            record = by_path[f"design/cards/{slug}"]
            current = audit.parse_source(blobs[f"design/cards/{slug}"]["text"])
            checklist_ids.append(record["id"])
            observed = {"Action":attr(action),"Attribute":attr(attribute)}
            expected = {"Action":attr(current["Action"]),"Attribute":attr(current["Attribute"])}
            if not check(hero,"checklist action and attribute",observed,expected,{"record":record["id"],"source":evidence(path,match[0])}):
                finding(hero,"ability checklist",f"{label}: stale action or attribute",observed,expected,"The printed learned-ability checklist disagrees with the current complete ability definition.",evidence(path,match[0]),[evidence(f"design/cards/{slug}","**Action:**")])
        check(hero,"complete learned checklist",sorted(checklist_ids),sorted(held_cards),{})
        signature_path = f"design/cards/{sig_slug}"
        embedded = re.search(r"Free signature: [^\n]+\n\n([\s\S]*?)\nFresh pool:",text)[1]
        embedded_source = "# Signature\n\n*Embedded excerpt.*\n\n## Rules\n\n" + re.sub(r"\*\*Signature limit:\*\*", "**Limits:**",embedded)
        printed_signature = audit.parse_source(embedded_source)
        actual_signature = audit.parse_source(blobs[signature_path]["text"])
        signature_differences = {field:{"printed":printed_signature.get(field,""),"current":actual_signature.get(field,"")} for field in ["Action","Attribute","Time","Target","Rules","Duration","Equipment","Limits"] if (attr(printed_signature.get(field,"")) if field == "Attribute" else normal(printed_signature.get(field,""))) != (attr(actual_signature.get(field,"")) if field == "Attribute" else normal(actual_signature.get(field,"")))}
        if signature_differences:
            finding(hero,"embedded signature",f"{signature['name']}: obsolete full procedure",{field:value["printed"] for field,value in signature_differences.items()},{field:value["current"] for field,value in signature_differences.items()},"The example reproduces an obsolete procedure, beyond a short paraphrase. Related At the table prose may repeat it. The linked current ability has a different use/effect.",evidence(path,"Free signature:"),[evidence(signature_path,"## Rules")],{"differences":signature_differences,"atTableText":split["At the table"].strip()})

        # Inventory prices and totals are transcribed directly from each printed shopping table.
        shopping = split["Starting coins and shopping — allocation"]
        coins = 40 + ancestry["coins"] + cls["coins"] + sum(origin["coins"] for origin in origin_rows)
        printed_start = int(re.search(r"= \*\*(\d+) coins",shopping)[1])
        check(hero,"starting coins",printed_start,coins,{})
        shopping_rows, purchased_bulk, spent_coins = [], 0, 0
        for line in shopping.splitlines():
            match = re.match(r"\| \[[^\]]+\]\(\.\./equipment/([^)]+)\) \| (\d+) \| (\d+) \| (\d+) \|",line)
            if not match:
                continue
            slug, price, bulk, left = match.groups()
            item = next(record for record in inventory["equipment"] if record["source"]["path"] == f"design/equipment/{slug}")
            spent_coins += item["price"]
            purchased_bulk += item["bulk"]
            check(hero,"market price",int(price),item["price"],{"item":item["id"]})
            check(hero,"market Bulk",int(bulk),item["bulk"],{"item":item["id"]})
            check(hero,"running coins",int(left),coins-spent_coins,{"item":item["id"]})
            shopping_rows.append(item["id"])
        granted_items = set(item for id in held_cards for item in acquisitions[id]["items"])
        granted_bulk = sum(equipment[id]["bulk"] for id in granted_items)
        maximum_hp = 12 + ancestry["hp"] + cls["hp"] + attributes["fortitude"] + len(set(trait_ids) & {"trait-dwarf-deep-constitution","trait-human-weathered","trait-halfling-stout-heart"}) + all_purchases.count("ability-conditioned-body")
        capacity = 10 + 3*attributes["brawn"] + int("trait-halfling-resilient" in trait_ids) + 3*int("trait-tallfolk-broad-back" in trait_ids)
        speed = ancestry["speed"] + attributes["agility"] + len(set(trait_ids) & {"trait-elf-unhurried-grace","trait-tallfolk-you-take-the-blow","trait-goblin-run-away-better"}) - max(0,granted_bulk+purchased_bulk-capacity)
        header = re.search(r"HP (\d+)/(\d+) · Grit (\d+)/(\d+) · Speed (\d+) squares · Bulk (\d+)/(\d+)",text)
        printed = dict(zip(["hp","maximumHp","grit","maximumGrit","speed","bulk","capacity"],map(int,header.groups())))
        current = {"hp":maximum_hp,"maximumHp":maximum_hp,"grit":2,"maximumGrit":2,"speed":speed,"bulk":granted_bulk+purchased_bulk,"capacity":capacity}
        for key in current:
            check(hero,"derived " + key,printed[key],current[key],{})
        if printed["speed"] != speed:
            finding(hero,"derived statistic","Speed retains the retired Human trait bonus",printed["speed"],speed,"Adaptable grants DP, not Speed. The formula still adds a trait Speed point. For Oren, this is the baseline from specified choices: an unchosen borrowed trait could later change his stats, so the complete build remains unresolved.",evidence(path,"**Human"),[evidence("design/ancestries/human.md"),evidence("design/ancestries/trait-human-far-walker.md")])
        heroes.append({"id":hero,"source":evidence(path),"attributes":attributes,"ancestry":ancestry["id"],"traits":trait_ids,"class":cls["id"],"signature":signature["id"],"stages":stages,"derived":{"printed":printed,"specifiedChoiceBaseline":current,"conditionalWoodedSpeed":speed+1 if "trait-elf-light-tread" in trait_ids else None},"inventory":{"grantedItems":sorted(granted_items),"grantedBulk":granted_bulk,"purchasedBulk":purchased_bulk,"shopping":shopping_rows,"startingCoins":coins,"spentCoins":spent_coins,"remainingCoins":coins-spent_coins},"coverage":"Every printed purchase/checklist/signature, ancestry summary, derived formula, origin/class grant and shopping row read directly; no test fixture overrides used."})

    # Human semantic review of summaries: only explicit mechanical contradictions are findings.
    reviewed_traits = [
        ("borin-bridgekeeper","trait-dwarf-carved-history","A Grudge Well Kept", "The example permits voluntary invocation after any damaging creature, once per combat, for one next attack until next turn; it even says the first hit need not be chosen. Current approval automatically marks the first damaging creature each combat, grants attack Boons against marked creatures permanently, and permits any number of grudges."),
        ("lira-ashbow","trait-elf-light-tread","Footfall on the Leaves", "The example narrows the terrain grant to natural undergrowth and says other difficult terrain is unchanged, while omitting +1 Speed in wooded terrain. Current grant covers difficult terrain in woodlands/forests including natural obstacles; printed default Speed 8 is valid outside the conditional terrain and becomes 9 within it."),
        ("vaelis-emberglass","trait-elf-age-of-memory","A Lifetime Ago", "The example gates the Boon to history/people/construction of a chosen remembered community. Current grant is once per day, before any Knowledge or Reason roll, calling on ancestral knowledge; it does not require a remembered community."),
        ("oren-brass","trait-human-many-homes","A Foot in Two Worlds", "The example grants two spoken-only ordinary languages and supplies no other-ancestry or borrowed-trait choice. Current grant chooses another ancestry, one native language and one of that ancestry's traits. No missing choice can be invented for the author; the worked example is incomplete under current rules."),
    ]
    for hero,tid,label,reason in reviewed_traits:
        path = f"design/characters/{hero}.md"
        line = next(line for line in blobs[path]["text"].splitlines() if line.startswith(f"- [{label}]"))
        definition_path = by_id[tid]["source"]["path"]
        related = "Borin can invoke A Grudge Well Kept after any creature damages him, once per combat; it need not be the first hit." if hero == "borin-bridgekeeper" else None
        if related:
            assert related in blobs[path]["text"]
        finding(hero,"ancestry summary",f"{label}: obsolete embedded rule",line.split("): ",1)[1],audit.parse_source(blobs[definition_path]["text"])["Rules"],reason,evidence(path,line),[evidence(definition_path,"## Rules")],{"relatedPrintedText":related})

    for hero in heroes:
        path = hero["source"]["path"]
        stale_names = collections.defaultdict(list)
        for match in re.finditer(r"\[([^\]]+)\]\(\.\./cards/([^)]*)\)",blobs[path]["text"]):
            definition_path = "design/cards/" + match[2]
            current_title = audit.parse_source(blobs[definition_path]["text"])["Title"]
            check(hero["id"],"printed ability name",match[1],current_title,{"source":evidence(path,match[0]),"definition":definition_path})
            if match[1] != current_title:
                stale_names[(match[1],current_title,definition_path)].append(blobs[path]["text"][:match.start()].count("\n")+1)
        for (printed,current,definition),line_numbers in stale_names.items():
            finding(hero["id"],"ability name",f"{printed} retains a superseded name",printed,current,"Stable source identity is retained, but the printed purchase/origin/checklist label uses an older name. This is a naming-conformance finding; the name alone is not treated as proof of additional mechanical drift.",evidence(path,f"[{printed}]"),[evidence(definition)],{"status":"naming-drift","allOccurrenceLines":line_numbers})

    cards = {path:audit.parse_source(source["text"]) for path,source in blobs.items() if path.startswith("design/cards/")}
    assert len(cards) == 427
    metadata = ["Action","Attribute","Target","Time","Duration","Equipment","Requirements","Tier","DP","Limits","Type","Tags"]
    rule_groups = collections.defaultdict(list)
    mechanical_groups = collections.defaultdict(list)
    for path,fields in cards.items():
        key = normal(fields["Rules"])
        rule_groups[key].append(path)
        mechanical_groups[(key,*[normal(fields.get(field,"")) for field in metadata])].append(path)
    def group(paths):
        differences = {field:{path:cards[path].get(field,"") for path in paths} for field in metadata if len({normal(cards[path].get(field,"")) for path in paths}) > 1}
        return {"members":[{"source":evidence(path),"stableId":cards[path]["ID"],"title":cards[path]["Title"],"fields":{field:cards[path].get(field,"") for field in metadata},"rules":cards[path]["Rules"]} for path in paths],"differingFields":differences,"classification":"same complete Rules text; differing metadata retained" if differences else "same complete Rules and all compared mechanical metadata"}
    duplicates = {"releasedCommit":audit.RELEASE,"abilityCount":len(cards),"comparedMetadata":metadata,"fullMechanicalDuplicateGroups":[group(paths) for paths in mechanical_groups.values() if len(paths)>1],"exactRulesGroups":[group(paths) for paths in rule_groups.values() if len(paths)>1],"triggerPair":{"members":[{"source":evidence(f"design/cards/{id}.md"),"fields":cards[f"design/cards/{id}.md"]} for id in ["keep-pressure","press-and-bind"]],"classification":"Different action and trigger/target timing: Reaction before Bleeding damage versus Maneuver. The shared reduction value does not make their complete procedures exact duplicates."},"limit":"Textual inventory only. No claim that distinct wording is distinct capability, that similar abilities are balanced, or that any consolidation/retirement is authorized."}
    report = {"releasedCommit":audit.RELEASE,"scope":{"workedExamples":len(heroes),"abilitiesInDuplicateInventory":len(cards),"fixtureOverridesUsed":False},"summary":{"mechanicalFindings":sum(value["status"] == "mechanical-contradiction" for value in findings),"namingFindings":sum(value["status"] == "naming-drift" for value in findings),"checks":len(checks),"matchingChecks":sum(check["status"] == "match" for check in checks),"findingsByHero":dict(collections.Counter(finding["hero"] for finding in findings)),"fullMechanicalDuplicateGroups":len(duplicates["fullMechanicalDuplicateGroups"]),"exactRulesGroups":len(duplicates["exactRulesGroups"])},"heroes":heroes,"findings":findings,"checks":checks,"limitations":["Oren's unspecified borrowed trait/native language prevents a fully resolved current build; baseline stats never invent that missing choice.","Source-locked catalog numeric metadata and acquisition adapters were hash-checked against immutable definitions; all actual printed rows were parsed independently of fixtures.","Short faithful summaries need not reproduce every outcome. Sap and Breath's healing values/HP payment and Mend's full procedure remain current; omitted Bleeding riders in the short Sap summary are not treated as a contradiction.","Dream beneath the Stars retains compatible reverie boundaries but omits the current affirmative counts-as-sleep wording; this is an editorial completeness observation, not a proven extra mechanic.","The character index repeats Mara/Oren's obsolete Speed and DP pool totals. Full-body Player PDF inclusion is established separately by the primary audit."]}
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/"worked-example-findings.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    (args.output/"ability-duplicate-inventory.json").write_text(json.dumps(duplicates,indent=2,ensure_ascii=False)+"\n")
    lines = ["# Worked-example conformance findings", "", f"Compared all six complete `design/characters/*.md` examples directly at `{audit.RELEASE}` against current ancestry/ability/origin/class/equipment definitions. No existing fixture overrides were used. The companion JSON records source hashes, one-based source lines, each purchase and every metadata/ledger check.", "", f"Found **{report['summary']['mechanicalFindings']} mechanical contradictions/ledger omissions** and **{report['summary']['namingFindings']} grouped naming discrepancies** across six examples. The current linked abilities do not repair the contradictory embedded prose printed beside them.", "", "| Example | Finding count | Review result |", "|---|---:|---|"]
    for hero in heroes:
        count = sum(finding["hero"] == hero["id"] for finding in findings)
        lines.append(f"| {hero['id']} | {count} | All purchases, prices, requirements, paired grants, checklist timing/attributes, copied signature, traits and derived/market totals reviewed. |")
    for hero in heroes:
        lines.extend(["",f"## {hero['id']}",""])
        for value in findings:
            if value["hero"] != hero["id"]:
                continue
            lines.append(f"- **{value['id']} · {value['title']}** — `{value['source']['path']}:{value['source']['line']}`. {value['reason']}")
            if value["category"] == "ability checklist":
                lines.append(f"  Printed `{value['printed']}`; current `{value['current']}`.")
            if value["category"] == "embedded signature":
                for field,diff in value["differences"].items():
                    lines.append(f"  - {field}: printed **{diff['printed']}** → current **{diff['current']}**")
                if hero["id"] in {"oren-brass","pip-copperwink","vaelis-emberglass"}:
                    lines.append(f"  - Related At the table text: {value['atTableText']}")
        lines.append(f"\nValidated unchanged numeric totals (specified choices): HP {hero['derived']['specifiedChoiceBaseline']['maximumHp']}, Bulk/capacity {hero['derived']['specifiedChoiceBaseline']['bulk']}/{hero['derived']['specifiedChoiceBaseline']['capacity']}, starting/spent/remaining coins {hero['inventory']['startingCoins']}/{hero['inventory']['spentCoins']}/{hero['inventory']['remainingCoins']}." + (" Oren remains conditional on his missing borrowed choice." if hero["id"] == "oren-brass" else ""))
    lines.extend(["", "## Exact duplicate inventory", "", f"Compared all **427 abilities**, complete Rules text and {', '.join(metadata)}. Found **{len(duplicates['fullMechanicalDuplicateGroups'])} groups** with identical complete Rules and all compared mechanical metadata. Found **{len(duplicates['exactRulesGroups'])} groups** with identical Rules but different metadata:", ""])
    for value in duplicates["exactRulesGroups"]:
        lines.append("- " + ", ".join(member["title"] for member in value["members"]) + ". Distinct fields: " + ", ".join(value["differingFields"]) + ".")
    lines.extend(["", "Keep Pressure versus Press and Bind is retained as a separate explicit comparison: Reaction before end-of-turn Bleeding damage versus Maneuver. Their shared Bleeding reduction is not an exact complete-procedure duplicate. This inventory neither proposes nor authorizes consolidation.", "", "## Limits and non-findings", "", *[f"- {value}" for value in report["limitations"]], "", "Reproduce with `python3 scripts/audit-worked-examples.py`; all authored sources and the ledger remain unchanged."])
    (args.output/"worked-example-findings.md").write_text("\n".join(lines)+"\n")
    print(json.dumps(report["summary"],indent=2))


if __name__ == "__main__":
    main()
