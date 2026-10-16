/** Render legacy rich text as plain text without attaching imported HTML to the page. */
function toPlainNoteText(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content.querySelectorAll("script, style, template, iframe, object, embed").forEach((element) => element.remove());
  template.content.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  template.content.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr").forEach((element) => element.append("\n"));
  return (template.content.textContent ?? "").replace(/\u00a0/g, " ").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function getLatestLeadNoteText(value: string | null | undefined) {
  if (!value?.trim()) return "";
  const text = toPlainNoteText(value);
  const entries = [...text.matchAll(/(?:^|\n)[\t ]*(\d{2}):(\d{2}):(\d{2})[\t ]+(\d{2})\/(\d{2})\/(\d{4})[\t ]*[-–—][\t ]*/g)];
  if (entries.length === 0) return text;
  const latest = entries.reduce((current, entry) => {
    const key = (match: RegExpMatchArray) => `${match[6]}${match[5]}${match[4]}${match[1]}${match[2]}${match[3]}`;
    return key(entry) >= key(current) ? entry : current;
  });
  const next = entries[entries.indexOf(latest) + 1];
  return text.slice(latest.index, next?.index ?? text.length).trim();
}
