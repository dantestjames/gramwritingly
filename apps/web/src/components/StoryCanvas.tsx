const PROMPTS: { key: string; label: string; hint: string }[] = [
  { key: "premise", label: "Premise", hint: "In one or two sentences, what is this story about?" },
  { key: "protagonist", label: "Main character", hint: "Who are they, what do they want, and what stands in the way?" },
  { key: "antagonist", label: "Opposition", hint: "Who or what pushes back hardest?" },
  { key: "setting", label: "Setting", hint: "Where and when? What does it smell and sound like?" },
  { key: "stakes", label: "Stakes", hint: "What happens if they fail?" },
  { key: "incitingIncident", label: "Inciting incident", hint: "What knocks their world off balance?" },
  { key: "midpoint", label: "Midpoint", hint: "What changes everything halfway through?" },
  { key: "climax", label: "Climax", hint: "The final confrontation or choice." },
  { key: "ending", label: "Ending", hint: "How has the character or world changed?" },
  { key: "themes", label: "Themes", hint: "What is the story really about underneath?" },
];

export function StoryCanvas({ value, onChange }: { value: Record<string, string>; onChange(v: Record<string, string>): void }) {
  return (
    <div className="panel canvas">
      <p className="muted">Plan your story before or while you draft. Saved with this document.</p>
      {PROMPTS.map((p) => (
        <label key={p.key} className="field">
          <span>{p.label}</span>
          <textarea rows={2} placeholder={p.hint} value={value[p.key] ?? ""} onChange={(e) => onChange({ ...value, [p.key]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}
