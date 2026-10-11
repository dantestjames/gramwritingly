/** Import and export for the web editor. Heavy libraries load only when used. */

export async function importFile(file: File): Promise<{ title: string; text: string }> {
  const title = file.name.replace(/\.[^.]+$/, "");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { title, text: value.replace(/\n{3,}/g, "\n\n").trim() };
  }
  const raw = await file.text();
  if (ext === "html" || ext === "htm") {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    doc.querySelectorAll("p, h1, h2, h3, h4, li, br, div").forEach((el) => el.append("\n"));
    return { title, text: (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim() };
  }
  if (ext === "md") return { title, text: raw.replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1") };
  return { title, text: raw };
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safe = (t: string) => (t.trim() || "Untitled").replace(/[\\/:*?"<>|]/g, "-");

export async function exportFile(format: "txt" | "md" | "html" | "docx", title: string, text: string) {
  const paras = text.split(/\n+/).filter((p) => p.trim());
  if (format === "txt") return download(`${safe(title)}.txt`, new Blob([text], { type: "text/plain" }));
  if (format === "md") return download(`${safe(title)}.md`, new Blob([`# ${title}\n\n${paras.join("\n\n")}\n`], { type: "text/markdown" }));
  if (format === "html") {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html><html lang="en-AU"><meta charset="utf-8"><title>${esc(title)}</title><body><h1>${esc(title)}</h1>${paras
      .map((p) => `<p>${esc(p)}</p>`)
      .join("\n")}</body></html>`;
    return download(`${safe(title)}.html`, new Blob([html], { type: "text/html" }));
  }
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const doc = new Document({
    sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }), ...paras.map((p) => new Paragraph(p))] }],
  });
  download(`${safe(title)}.docx`, await Packer.toBlob(doc));
}
