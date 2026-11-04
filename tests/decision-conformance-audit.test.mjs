import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const result = JSON.parse(execFileSync("python3", ["-c", String.raw`
import importlib.util,json
spec=importlib.util.spec_from_file_location('audit','scripts/audit-decision-conformance.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
def row(id,field,value,decision='Approved',date='2026-11-01',original='Old'):
 return dict(change_id=id,source_file='design/cards/fixture.md',stable_id='fixture',field=field,revised=value,original=original,decision=decision,date=date)
def source(rules='New rule.',action='Reaction'):
 text='# Fixture\n\n*A narrative.*\n\n## Rules\n\n**Action:** '+action+' · **Attribute:** Reason\n\n**Target / range / shape:** Self.\n\n'+rules+'\n\n---\n\n**Tier / minimum level:** 1 · **DP:** 2 · **Requirements to learn:** None\n\n**ID:** fixture\n'
 return {'design/cards/fixture.md':dict(text=text,sha256=audit.digest(text),gitBlob='fixture')}
checks={}
rows=[row('old','Rules','Old rule.',date='2026-10-31'),row('new','Rules','New rule.')]
checks['supersession']=[r['status'] for r in audit.audit_rows(rows,source())]
checks['different_field']=[r['status'] for r in audit.audit_rows([row('rules','Rules','Missing.'),row('action','Action','Reaction')],source())]
checks['substring']=audit.audit_rows([row('partial','Rules','New rule.')],source('New rule. Additional unapproved effect.'))[0]['status']
checks['unapproved']=audit.audit_rows([row('proposal','Rules','A wholly new proposed rule.',decision='Proposed',original='An older current rule.')],source('A wholly new proposed rule.'))[0]['status']
checks['retained']=audit.audit_rows([row('proposal','Rules','A wholly new proposed rule.',decision='Proposed',original='New rule.')],source())[0]['status']
checks['hash_only']=audit.audit_rows([row('summary','New ability','A summary that has no exact field mapping.')],source(),{'fixture':dict(ledgerLinked=False,fields={'Rules':'New rule.'},path='proposal',sha256='x')})[0]['status']
checks['compound']=audit.row_fields(row('compound','Action','Reaction · Attribute: None (no roll)'))
checks['unapproved_later']=[r['status'] for r in audit.audit_rows([row('approved','Rules','New rule.'),row('draft','Rules','Newly proposed replacement.',decision='Proposed',date='2026-11-02',original='New rule.')],source())]
checks['links']=audit.compare_field('[Vision](one.md)','[Vision](two.md)')
checks['parser']=audit.parse_source(source()['design/cards/fixture.md']['text'])['Rules']
print(json.dumps(checks))
`], {encoding:"utf8"}));

test("decision audit supersedes only later approved decisions for the same field",()=>{
 assert.deepEqual(result.supersession,["superseded","verified"]);
 assert.deepEqual(result.different_field,["mismatch","verified"]);
});
test("decision audit rejects substring and hash-only conformance claims",()=>{
 assert.equal(result.substring,"mismatch");
 assert.equal(result.hash_only,"manual-review");
});
test("decision audit flags unapproved substantive replacement and verifies complete original retention",()=>{
 assert.equal(result.unapproved,"mismatch");
 assert.equal(result.retained,"verified");
});
test("decision audit separates explicit compound metadata from complete rules text",()=>{
 assert.deepEqual(result.compound,{Action:"Reaction",Attribute:"None (no roll)"});
 assert.equal(result.parser,"New rule.");
});

test("later proposals do not supersede approvals and visible labels do not hide conflicting link targets",()=>{
 assert.deepEqual(result.unapproved_later,["verified","verified"]);
 assert.equal(result.links,null);
});
