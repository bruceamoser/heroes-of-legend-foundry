#!/usr/bin/env python3
"""Evidence audit of the authoritative change ledger against immutable released Git blobs.

A verified result establishes the documented text/absence check only. It is not
human approval, a semantic equivalence judgment, balance certification or runtime
verification. Derived manifests and hashes locate evidence; they never grant approval.
"""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata

RELEASE = "f3fb98ca03b046335fcc730c1b05689bebf091b4"
APPROVED = {"Approved", "Approved with specified amendment", "Approved with specified addition", "Approved with specified simplification"}
ALIASES = {"design/ancestries/elf.md": "design/ancestries/wood-elf.md", "design/ancestries/dwarf.md": "design/ancestries/hill-dwarf.md"}
FIELD_ALIASES = {"Target / range": "Target", "Target / range / shape": "Target", "Equipment / acquisition": "Equipment", "Tier / minimum level": "Tier", "Requirements to learn": "Requirements", "Tier price": "DP"}
SIMPLE = {"Title", "Narrative", "Rules", "Target", "Attribute", "Action", "Limits", "Duration", "Tags", "Equipment", "Time", "Type", "Tier", "DP", "Requirements", "Starting values"}
META = {"Action", "Attribute", "Time", "Target / range / shape", "Duration", "Equipment / acquisition", "Tier / minimum level", "Tier", "Minimum level", "DP", "Requirements to learn", "Type", "Tags", "Limits", "ID", "Status", "Ancestry", "Choice", "Trigger"}


def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def visible(value):
    """Only editorial Markdown/whitespace normalization, never a substring test."""
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n"))
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"\1", value)
    value = re.sub(r"(?<!\w)\*([^*\n]+)\*(?!\w)", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    return re.sub(r"\s+", " ", value).strip()


def parse_source(text):
    fields = {}
    title = re.search(r"^# ([^\n]+)", text)
    if title:
        fields["Title"] = title[1]
    rules = re.search(r"^## Rules\s*$", text, re.M)
    if rules and title:
        fields["Narrative"] = text[title.end():rules.start()].strip()
    # Capture complete, anchored metadata values, including same-line dot-separated fields.
    for match in re.finditer(r"\*\*([^*\n]+):\*\*\s*([^\n]*?)(?= · \*\*|\n|$)", text):
        label, value = match[1], match[2].strip()
        if label in META or label == "Starting values":
            fields[FIELD_ALIASES.get(label, label)] = value
    if "Minimum level" in fields:
        fields["Tier"] = fields["Minimum level"]
    elif fields.get("Tier") in {"Novice", "Adept", "Master"}:
        fields["Tier"] = {"Novice":"1", "Adept":"3", "Master":"7"}[fields["Tier"]]
    if rules:
        for outcome in re.finditer(r"^- \*\*(Weak|Standard|Strong):\*\* (.+)$", text, re.M):
            fields["Rules — " + outcome[1]] = outcome[2]
        body = text[rules.end():].split("\n---\n", 1)[0]
        blocks = []
        for block in re.split(r"\n\s*\n", body.strip()):
            label = re.match(r"^\*\*([^*\n]+):\*\*", block)
            if label and label[1] in META:
                continue
            if re.fullmatch(r"(?:\[[^\]]+\]\([^)]+\)(?: · )?)+", block):
                continue
            blocks.append(block)
        fields["Rules"] = "\n\n".join(blocks).strip()
    return fields


def row_fields(row):
    """Return explicit expected fields; None means the prose needs interpretation."""
    field, value = row["field"], row["revised"]
    canonical = FIELD_ALIASES.get(field, field)
    if field == "Action" and " · Attribute: " in value:
        action, attribute = value.split(" · Attribute: ", 1)
        return {"Action":action,"Attribute":attribute}
    if field == "Tier / minimum level" and re.fullmatch(r"Tier: (?:Novice|Adept|Master) · Minimum level: [137]", value):
        return {"Tier":value[-1]}
    if canonical in SIMPLE and field != "Tier price" or field in {"Rules — Weak","Rules — Standard","Rules — Strong"}:
        return {canonical:value}
    if value.startswith("# ") and "\n## Rules" in value:
        return {k:v for k,v in parse_source(value).items() if k not in {"ID", "Status"}}
    if value.startswith("# "):
        return {"document":value}
    if field == "Narrative and Rules":
        match = re.fullmatch(r"Narrative: (.*?) Rules: (.*)", value, re.S)
        if match:
            return {"Narrative":match[1], "Rules":match[2]}
    if field == "Rules and Action":
        match = re.fullmatch(r"(.*?) Action: (.*)", value, re.S)
        if match:
            return {"Rules":match[1], "Action":match[2]}
    if field == "Tier / Type / Tags / Attribute":
        parts = re.fullmatch(r"Tier: (?:Novice|Adept|Master) · Minimum level: ([137]); Type: (.*?); Tags: (.*?); Attribute: (.*)", value, re.S)
        if parts:
            return dict(zip(["Tier", "Type", "Tags", "Attribute"], parts.groups()))
    return None


def effective_keys(row, expected):
    if expected is not None:
        return set(expected)
    # Explicit compound field names define supersession scope even when their values are prose.
    field = row["field"]
    if field in {"Card text", "New ability", "Card proposal", "Batch proposal: narrative, Rules and Action", "Rules, narrative and concept", "Replacement concept, narrative, Rules and Action", "Concept, title, narrative, Rules and Action", "Final batch approval"}:
        return {"Title", "Narrative", "Rules", "Action"}
    if field in {"Shared rules and reader guidance", "Creative foundation", "Shared-rule/release decision"}:
        return {"directive:" + row["change_id"]}
    return {FIELD_ALIASES.get(field, field)}


def git_blobs(repository, commit):
    paths = subprocess.check_output(["git", "-C", str(repository), "ls-tree", "-r", "--name-only", commit], text=True).splitlines()
    selected = [path for path in paths if path.startswith("design/") and path.endswith(".md")]
    process = subprocess.run(["git", "-C", str(repository), "cat-file", "--batch"], input="".join(f"{commit}:{path}\n" for path in selected).encode(), stdout=subprocess.PIPE, check=True)
    result, offset = {}, 0
    for path in selected:
        end = process.stdout.index(b"\n", offset)
        header = process.stdout[offset:end].decode().split()
        length = int(header[2])
        data = process.stdout[end + 1:end + 1 + length]
        result[path] = {"text":data.decode(), "sha256":digest(data), "gitBlob":header[0]}
        offset = end + 2 + length
    return result


def resolve_path(source, blobs):
    source = ALIASES.get(source, source)
    if source in blobs:
        return source
    if not source.startswith("design/"):
        candidate = f"design/cards/{source}"
        if candidate in blobs:
            return candidate
    # Keep a deterministic intended missing path, never guess another source by title.
    return source if source.startswith("design/") else f"design/cards/{source}"


def compare_field(actual, expected):
    if actual == expected:
        return "exact-field"
    if visible(actual) == visible(expected):
        actual_links = re.findall(r"\[[^\]]+\]\(([^)]+)\)",actual)
        expected_links = re.findall(r"\[[^\]]+\]\(([^)]+)\)",expected)
        if expected_links and actual_links and actual_links != expected_links:
            return None
        return "whole-visible-field"
    return None


def audit_rows(rows, blobs, proposals=None):
    proposals = proposals or {}
    enriched = []
    for index, row in enumerate(rows):
        expected = row_fields(row)
        enriched.append({"row":row, "ledgerRow":index + 2, "path":resolve_path(row["source_file"], blobs), "expected":expected, "keys":effective_keys(row, expected), "order":(row["date"],index)})
    by_field = collections.defaultdict(list)
    for item in enriched:
        if item["row"]["decision"] in APPROVED:
            for key in sorted(item["keys"]):
                by_field[(item["path"],key)].append(item)
    output = []
    for item in enriched:
        row, path = item["row"], item["path"]
        source = blobs.get(path)
        actual = {**parse_source(source["text"]), "document":source["text"]} if source else {}
        governing = {}
        for key in sorted(item["keys"]):
            later = [candidate for candidate in by_field[(path,key)] if candidate["order"] > item["order"]]
            if later:
                governing[key] = max(later,key=lambda candidate:candidate["order"])["row"]["change_id"]
        active = item["keys"] - governing.keys()
        status, reasons, evidence = "manual-review", [], []
        approved = row["decision"] in APPROVED
        if not active:
            status = "superseded"
            reasons.append("Every explicit field is governed by a later approved ledger row; approval is not inferred from chronology alone.")
        elif row["decision"] == "Cut":
            if not source and not any(parse_source(value["text"]).get("ID") == row["stable_id"] for value in blobs.values()):
                status = "verified"
                reasons.append("Cut stable ID and intended source path are both absent from the released design corpus.")
            else:
                status = "mismatch"
                reasons.append("Cut source/stable ID is still present; human disposition review required.")
        elif not source:
            if approved:
                status = "mismatch"
                reasons.append("An active approved ledger row's intended released source is absent.")
            elif row["decision"] in {"Rejected", "Withdrawn"}:
                status = "manual-review"
                reasons.append("Rejected/withdrawn proposal source is absent; absence excludes that file but does not resolve whether an original version should remain.")
            else:
                reasons.append("Unapproved source is absent; interpreted concept/identity exclusion needs human review.")
        elif item["expected"] is None:
            # Hash-selected full proposals provide a comparison basis, never an approval substitute.
            proposal = proposals.get(row["stable_id"])
            if approved and proposal and proposal["ledgerLinked"]:
                expected = proposal["fields"]
                mismatches = []
                for field, value in expected.items():
                    if field in {"ID", "Status"}:
                        continue
                    method = compare_field(actual.get(field,""),value)
                    evidence.append({"field":field,"expected":value,"actual":actual.get(field,""),"comparison":method or "different", "basis":"hash-identified full proposal", "proposalPath":proposal["path"], "proposalSha256":proposal["sha256"]})
                    if not method:
                        mismatches.append(field)
                status = "mismatch" if mismatches else "verified"
                reasons.append("Approved ledger row linked to a full proposal revision; all extracted complete fields compared. Hash parity locates evidence and is not semantic approval proof.")
            else:
                reasons.append("Ledger value is a summary, composite instruction or shared directive; no exact field mapping established. Whole-file hashes/substrings cannot verify its meaning.")
        else:
            comparisons = []
            for field, value in item["expected"].items():
                if field not in active:
                    continue
                method = compare_field(actual.get(field,""), value)
                evidence.append({"field":field,"expected":value,"actual":actual.get(field,""),"comparison":method or "different", "basis":"authoritative ledger complete field"})
                comparisons.append(bool(method))
            if approved:
                status = "verified" if all(comparisons) else "manual-review" if "document" in active else "mismatch"
                reasons.append("Complete active fields equal the approved ledger text (editorial Markdown/whitespace normalization only)." if status == "verified" else "An approved complete document differs from release; section-level mapping of subsequent rulings is required before deciding conformance." if status == "manual-review" else "At least one complete active field differs from the approved ledger text; this is literal drift, not a judgment about semantic equivalence or approval.")
            else:
                # A common value such as Passive/None or deletion cannot prove proposal incorporation.
                original = dict(row, revised=row["original"])
                originals = row_fields(original)
                original_matches = originals is not None and set(active).issubset(originals) and all(compare_field(actual.get(field,""),originals[field]) for field in active)
                substantive = any(bool(visible(value)) and field in {"Rules", "Narrative", "Title"} for field,value in item["expected"].items() if field in active)
                if comparisons and all(comparisons) and substantive and not original_matches:
                    status = "mismatch"
                    reasons.append("Complete substantive unapproved/rejected replacement field is present without a later approved row for that field; suspected incorporation requires human authority review.")
                elif original_matches:
                    status = "verified"
                    reasons.append("Complete original active fields are retained; this historical proposal did not replace those fields.")
                else:
                    reasons.append("Neither a complete original retention check nor a discriminating substantive replacement check proves disposition; common metadata/absence is not semantic evidence.")
        if governing:
            reasons.append("Supersession is tracked separately for each field; partially superseded rows retain their remaining active checks.")
        output.append({"ledgerRow":item["ledgerRow"], **row, "resolvedSource":path, "status":status, "reasons":reasons, "activeFields":sorted(active), "supersededFields":governing, "sourceEvidence":({"commit":RELEASE,"path":path,"sha256":source["sha256"],"gitBlob":source.get("gitBlob")} if source else None), "fieldEvidence":evidence})
    return output


def collect_proposals(review, rows, blobs):
    approval_path = review / "production-2026-11-01/approval.json"
    application_path = review / "production-2026-11-01/source-application.json"
    approvals = json.loads(approval_path.read_text())
    application = json.loads(application_path.read_text())
    application_by_id = {entry["stable_id"]:entry for entry in application["discipline"]}
    proposals, report = {}, []
    for entry in approvals["manifest"]:
        if entry["decision"] != "Approved":
            continue
        sid = entry["stable_id"]
        path = review / "discipline-design/proposals" / f"{sid}.md"
        if not path.exists():
            report.append({"stableId":sid,"status":"missing-proposal"})
            continue
        data = path.read_bytes()
        actual = digest(data)
        ledger = [row for row in rows if row["stable_id"] == sid and row["decision"] in APPROVED and entry["revision_sha256"] in row["notes"]]
        record = {"path":str(path),"sha256":actual,"fields":parse_source(data.decode()),"ledgerLinked":bool(ledger) and actual == entry["revision_sha256"], "approvalManifestHashMatches":actual == entry["revision_sha256"], "applicationManifestHashMatches":application_by_id.get(sid,{}).get("revision_sha256") == actual,"ledgerChangeIds":[row["change_id"] for row in ledger]}
        proposals[sid] = record
        source_path = resolve_path(application_by_id.get(sid,{}).get("source_file",f"design/cards/{sid}.md"),blobs)
        actual_fields = parse_source(blobs[source_path]["text"]) if source_path in blobs else {}
        comparisons = [{"field":field,"expected":value,"actual":actual_fields.get(field,""),"comparison":compare_field(actual_fields.get(field,""),value) or "different"} for field,value in record["fields"].items() if field not in {"Status"}]
        report.append({"stableId":sid,**{k:v for k,v in record.items() if k != "fields"},"releasedSource":source_path,"releasedSha256":blobs.get(source_path,{}).get("sha256"),"contentComparison":comparisons,"transcriptionStatus":"verified-transcription" if record["ledgerLinked"] and all(item["comparison"] != "different" for item in comparisons) else "manual-review", "limit":"Complete field transcription plus evidence integrity; no semantic approval inferred from hashes or derived manifests."})
    return proposals, report, [approval_path,application_path]


def main():
    global RELEASE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review",type=Path,default=Path("/home/bmoser/OpenBaD/workspaces/heroes-of-legend/review"))
    parser.add_argument("--repository",type=Path,default=Path("/home/bmoser/repos/heroes-of-legend"))
    parser.add_argument("--output",type=Path,default=Path("test-results/decision-audit"))
    parser.add_argument("--commit",default=RELEASE,help="Immutable source revision to verify; defaults to original audit release")
    args = parser.parse_args()
    RELEASE = args.commit
    ledger = args.review / "CHANGE_LEDGER.csv"
    with ledger.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len({row["change_id"] for row in rows}) != len(rows):
        raise ValueError("Duplicate authoritative change IDs")
    blobs = git_blobs(args.repository,RELEASE)
    proposals, proposal_report, manifests = collect_proposals(args.review,rows,blobs)
    results = audit_rows(rows,blobs,proposals)
    summary = {"schemaVersion":1,"releasedCommit":RELEASE,"authority":"CHANGE_LEDGER.csv decisions; exact current user authority remains primary's responsibility", "scope":{"ledgerRows":len(rows),"exactApprovedRows":sum(row["decision"] == "Approved" for row in rows),"qualifiedApprovedRows":sum(row["decision"] in APPROVED and row["decision"] != "Approved" for row in rows),"exactApprovedSourceFiles":len({row["source_file"] for row in rows if row["decision"] == "Approved"}),"releasedDesignMarkdownFiles":len(blobs)},"statusCounts":dict(collections.Counter(row["status"] for row in results)),"decisionStatusCounts":{decision:dict(collections.Counter(row["status"] for row in results if row["decision"] == decision)) for decision in sorted({row["decision"] for row in rows})},"evidenceInputs":[{"path":str(path),"sha256":digest(path.read_bytes())} for path in [ledger,*manifests]],"method":{"supersession":"ISO decision date then authoritative ledger order, same resolved source and explicit field; later Approved/qualified Approved only", "comparison":"Complete fields only; exact text or visible Markdown/whitespace equality. Link targets must agree when both versions specify links. No substring or hash-only approval inference.","proposals":"Full revision hashes link proposal bodies to approved ledger rows. Derived manifests cross-check evidence; no approval inferred from manifests.","limitations":["Verified means the specified literal/absence check passed, not semantic approval or game-design conformance.","Unknown composite and shared directives require human interpretation; machine mismatches are candidate literal drift.","All ledger rows are covered; source files without ledger changes are not thereby approved or rejected.","Date ties use ledger order; primary must resolve any conflicting same-day authority.","ledgerRow is the header-inclusive CSV record ordinal, not a physical line number in multiline CSV.","Plain-text ledger labels do not specify link targets; link integrity is not established by visible-text equality."]}}
    args.output.mkdir(parents=True,exist_ok=True)
    write = lambda name,value: (args.output/name).write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n")
    write("summary.json",summary)
    write("rows.json",results)
    write("proposal-evidence.json",proposal_report)
    write("sources.json",[{"path":path,"ledgerRows":len(selected := [row for row in results if row["resolvedSource"] == path]),"statusCounts":dict(collections.Counter(row["status"] for row in selected)),"releasedSha256":blobs.get(path,{}).get("sha256")} for path in sorted({row["resolvedSource"] for row in results})])
    write("mismatches.json",[row for row in results if row["status"] == "mismatch"])
    write("manual-review.json",[row for row in results if row["status"] == "manual-review"])
    with (args.output/"coverage.csv").open("w",newline="") as handle:
        writer = csv.DictWriter(handle,fieldnames=["ledgerRow","change_id","decision","source_file","field","status","reason"])
        writer.writeheader()
        for row in results:
            writer.writerow({**{key:row[key] for key in writer.fieldnames if key != "reason"},"reason":" ".join(row["reasons"])})
    # Report the observed comparison of the triggering pair without judging design redundancy.
    pair = []
    for sid in ["keep-pressure","press-and-bind"]:
        path = f"design/cards/{sid}.md"
        pair.append({"stableId":sid,"source":{"commit":RELEASE,"path":path,"sha256":blobs[path]["sha256"]},"fields":parse_source(blobs[path]["text"]),"ledgerRows":[row["change_id"] for row in results if row["stable_id"] == sid],"proposalEvidence":proposals.get(sid)})
    write("trigger-pair.json",pair)
    # Scan complete substantive fields across the release for transplanted rejected
    # text. These are candidates, never semantic equivalence/approval conclusions.
    rejected_inventory = []
    parsed_release = {path:parse_source(source["text"]) for path,source in blobs.items()}
    for row in rows:
        if row["decision"] not in {"Rejected", "Cut", "Withdrawn", "Original concept rejected; replacement proposed"}:
            continue
        fields = row_fields(row) or {}
        for field,value in fields.items():
            if not value or field not in {"Title","Narrative","Rules"}:
                continue
            matches = [path for path,source_fields in parsed_release.items() if compare_field(source_fields.get(field,""),value)]
            rejected_inventory.append({"changeId":row["change_id"],"decision":row["decision"],"field":field,"expectedRejectedValue":value,"completeFieldMatches":matches,"status":"manual-review" if matches else "no-complete-field-match","limit":"Exact complete-field matches are candidate text survival, not proof of rejected concept adoption; nonmatching paraphrases cannot be ruled out."})
    write("rejected-field-inventory.json",rejected_inventory)
    markers = []
    for path,source in blobs.items():
        for number,line in enumerate(source["text"].splitlines(),1):
            if re.search(r"(?:\*\*(?:Status|Proposal|Proposed[^*]*):\*\*.*(?:propos|pending|draft)|\bProposal:)",line,re.I):
                markers.append({"path":path,"line":number,"text":line,"sourceSha256":source["sha256"],"status":"manual-review","limit":"Authoring wording is an observation; only governing decisions determine approval."})
    write("proposal-markers.json",markers)

    (args.output/"README.md").write_text("# Decision conformance evidence\n\nRun `python3 scripts/audit-decision-conformance.py`. Inputs and immutable released commit are recorded in summary.json. rows.json and coverage.csv cover every authoritative row, including non-approved history. Supersession is field-specific. See fieldEvidence for complete expected/released text and reasons for limits.\n\nA verified row establishes only its specified literal or absence check. It is not semantic approval, design validation or proof against an unrecorded decision. Mismatches and manual-review rows require primary review. Manifest and proposal hashes locate/reproduce evidence; they never grant approval.\n")
    print(json.dumps({"output":str(args.output),**summary["scope"],"statusCounts":summary["statusCounts"]},indent=2))


if __name__ == "__main__":
    main()
