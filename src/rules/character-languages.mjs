/** Explicit sheet language edits mirror workshop play controls, not creation grants. */
export function editCharacterLanguage(state, {removeId, language}) {
  const next = structuredClone(state);
  next.languages ??= [];
  if (typeof removeId === "string") {
    if (!next.languages.some(entry => entry.id === removeId)) throw new Error("That language is no longer on the sheet.");
    next.languages = next.languages.filter(entry => entry.id !== removeId);
    return next;
  }
  if (!language || typeof language.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(language.id) || typeof language.name !== "string" || !language.name.trim() || language.name.length > 80 || !["spoken","signed"].includes(language.form) || typeof language.written !== "boolean") throw new Error("Name a language and choose its form and written permissions.");
  if (next.languages.some(entry => entry.id === language.id || entry.name.toLocaleLowerCase() === language.name.trim().toLocaleLowerCase())) throw new Error("That language is already on the sheet.");
  if (next.languages.length >= 100) throw new Error("This character supports up to 100 languages.");
  next.languages.push({id:language.id,name:language.name.trim(),form:language.form,source:"play",permissions:{understand:true,express:true,speak:language.form === "spoken",sign:language.form === "signed",read:language.written,write:language.written}});
  return next;
}
