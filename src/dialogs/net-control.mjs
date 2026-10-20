/** Direct net choices supplement the native keyboard-accessible range control. */
export function bindNetChoices(element) {
  for (const slider of element.querySelectorAll('input[name="adjustment"]')) {
    if (slider.dataset.holChoices) continue;
    slider.dataset.holChoices = "true";
    const choices = document.createElement("div");
    choices.className = "hol-net-choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Choose net Banes or Boons");
    for (let value = -3; value <= 3; value++) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.netValue = value;
      button.textContent = value > 0 ? `+${value}` : String(value);
      button.setAttribute("aria-label", value === 0 ? "No Boons or Banes" : `${Math.abs(value)} ${value < 0 ? "Banes" : "Boons"}`);
      button.addEventListener("click", () => {
        slider.value = value;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      choices.append(button);
    }
    const sync = () => {
      const value = Number(slider.value);
      choices.dataset.polarity = value < 0 ? "bane" : value > 0 ? "boon" : "even";
      for (const button of choices.children) button.setAttribute("aria-pressed", String(Number(button.dataset.netValue) === value));
    };
    slider.addEventListener("input", sync);
    slider.after(choices);
    sync();
  }
}
