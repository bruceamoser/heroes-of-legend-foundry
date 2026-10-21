import {readFile, mkdir, writeFile, readdir} from 'node:fs/promises';
import {woundTableDocuments} from './content/wound-tables.mjs';
export async function generateWoundTables(root=new URL('../',import.meta.url),{check=false}={}){
 const catalog=JSON.parse(await readFile(new URL('static/data/wounds.json',root),'utf8'));
 const directory=new URL('content/tables/wounds/',root),documents=woundTableDocuments(catalog);
 if(!check)await mkdir(directory,{recursive:true});
 for(const document of documents){const path=new URL(`${document._id}.json`,directory),text=JSON.stringify(document,null,2)+'\n';if(check){if(await readFile(path,'utf8')!==text)throw new Error(`Stale wound table ${document.name}`);}else await writeFile(path,text);}
 if((await readdir(directory)).length!==5)throw new Error('Expected exactly five native wound tables.');
 return documents;
}
if(process.argv[1]?.endsWith('generate-wound-tables.mjs')){await generateWoundTables(undefined,{check:process.argv.includes('--check')});console.log('Validated five native wound RollTables.');}
