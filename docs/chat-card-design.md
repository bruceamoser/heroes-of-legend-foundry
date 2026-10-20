# Web chat-card design

`chat.html` is a compact, Foundry-width chat design workspace linked from every
web preview. The layout reference is Neon Relic's
`src/templates/roll/roll-chatcard.hbs` and `src/styles/_roll-card.scss`: grouped
header, roll summary, visible dice and a separate result/effect area. HOL retains
its forest/gold/parchment theme and its own rules.

The initial examples show Goblin Scrapper's Scrap knife defense request, a
Standard defense and a Strong Hook and Drive player attack. Card examples can be
added for healing, supply, natural benefit and natural complication. Source attack
outcomes, player ability effects and potion definitions come from the pinned
catalogs and existing shared rule helpers. Example histories are illustrative;
no saved character, Foundry document or campaign is mutated. Numeric pending
defense damage is labeled before resistance. Healing and supply examples retain
the final successful use when the supply becomes empty.

Creature requests display all three **player-defense** outcomes, printed defense
attribute/Threat, captured-target suggestions and one reusable Defend button.
Suggestions are informational, not permissions or a target picker. In this local
example Borin represents the current player; pressing Defend opens his shared
rollable attribute/ability dialog and posts another result. Repeated defense and
Roll again remain available. Native multi-client identity/targeting is not
simulated by this preview.

`web/chat-cards.mjs` renders compact cards with escaped public text. Roll cards
show actor/action, target or attacker, attribute and net modifier, all original
dice, exactly three kept indices, tier/total, selected complete effects and
optional roll details. Discarded dice have a dashed border, strike-through and
accessible labels. Equal-valued dice retain distinct original indices. Natural
111/666 consequences appear separately from the tier and total. Player attacks
do not offer an additional Defend roll. Pending effects are labeled Not applied;
the web prototype does not claim resource/damage application.

The existing roll preview now renders these same result cards. The native Foundry
chat templates, socket handlers, permissions and application services remain
unchanged for this design pass.

`npm run test:chat-preview` verifies pinned outcomes, multiple defender suggestions,
repeat defense, duplicate-face retention, complete player effects, potion final
use, supply decay, naturals, escaped text and 760/390/320px layouts. CI and Pages
run it alongside all seven existing browser suites; screenshots are saved to
`test-results/chat/`.
