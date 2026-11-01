import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const css=await readFile(new URL("../static/styles/character-sheet.css",import.meta.url),"utf8");
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.setContent(`<style>body{margin:20px;font:14px sans-serif}.heroes-of-legend{width:600px}${css}</style><div class="heroes-of-legend"><section class="hol-character-sheet"><main class="hol-character-content"><div class="hol-main-layout"><div class="hol-main-actions"><details open><summary>Main Actions</summary><table class="hol-action-table"><thead><tr><th>Ability</th><th>Attribute</th><th>Effect</th></tr></thead><tbody><tr><td><div class="hol-action-name"><button>Spring in the Sleeve</button><button class="hol-action-roll">⚄</button></div></td><td>Knowledge</td><td><span class="hol-brief">Make a Knowledge device attack. Pull the enemy toward you.</span></td></tr></tbody></table></details></div><aside class="hol-play-summary"><details open><summary>Maneuvers and Reactions</summary><p>Wake the Nerves</p></details></aside></div></main></section></div>`);
 const bounds=await page.evaluate(()=>{
  const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
  const text=selector=>{const range=document.createRange();range.selectNodeContents(document.querySelector(selector));const r=range.getBoundingClientRect();return {x:r.x,right:r.right};};
  return {main:box('.hol-main-actions'),sidebar:box('.hol-play-summary'),attribute:box('tbody td:nth-child(2)'),effect:box('tbody td:nth-child(3)'),attributeText:text('tbody td:nth-child(2)'),attributeHeading:text('thead th:nth-child(2)'),effectHeading:text('thead th:nth-child(3)')};
 });
 assert(bounds.sidebar.y>=bounds.main.bottom,`Sidebar must stack at sheet width600 in viewport1200: ${JSON.stringify(bounds)}`);
 assert(bounds.attributeText.right<=bounds.effect.x,`Knowledge must remain inside its column: ${JSON.stringify(bounds)}`);
 assert(bounds.attributeHeading.right<bounds.effectHeading.x,`Attribute and Effect headings must not overlap: ${JSON.stringify(bounds)}`);
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../test-results/narrow-character-layout.png',import.meta.url).pathname});
 await page.locator('.heroes-of-legend').evaluate(element=>element.style.width='900px');
 const wide=await page.evaluate(()=>{const main=document.querySelector('.hol-main-actions').getBoundingClientRect(),sidebar=document.querySelector('.hol-play-summary').getBoundingClientRect();return {mainRight:main.right,mainTop:main.top,sidebarX:sidebar.x,sidebarTop:sidebar.top};});
 assert(wide.sidebarX>=wide.mainRight&&wide.sidebarTop===wide.mainTop,`Wide sheet must retain sidebar: ${JSON.stringify(wide)}`);
 console.log('Verified narrow native character layout at window600 / viewport1200 and retained wide sidebar.');
} finally { await browser.close(); }
