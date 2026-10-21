import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {woundTableDocuments} from '../scripts/content/wound-tables.mjs';
import {woundRoll,WOUND_KEYS} from '../src/rules/wounds.mjs';
const catalog=JSON.parse(await readFile(new URL('../static/data/wounds.json',import.meta.url)));
test('five native wound tables cover exactly the weighted canonical three-die outcomes',()=>{
 const tables=woundTableDocuments(catalog);assert.equal(tables.length,5);
 const frequency={};for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++){const key=woundRoll(0,[a,b,c]).key;frequency[key]=(frequency[key]??0)+1;}
 for(const table of tables){assert.equal(table.formula,'1d216');assert.equal(table.replacement,true);assert.equal(table.results.length,56);let last=0;
 for(const result of table.results){const key=result.flags['heroes-of-legend'].woundKey;assert(WOUND_KEYS.includes(key));assert.equal(result.weight,frequency[key]);assert.deepEqual(result.range,[last+1,last+frequency[key]]);last=result.range[1];assert(result.description.includes('Remedy:'));}assert.equal(last,216);}
});
test('all cumulative wound dice resolve a result key in every native table',()=>{
 const tables=woundTableDocuments(catalog);
 for(let count=3;count<=5;count++)for(let n=0;n<6**count;n++){let i=n;const faces=Array.from({length:count},()=>{const face=i%6+1;i=Math.floor(i/6);return face;});const key=woundRoll(count-3,faces).key;for(const table of tables)assert(table.results.some(r=>r.flags['heroes-of-legend'].woundKey===key));}
});
