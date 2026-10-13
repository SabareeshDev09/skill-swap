"use client";
import { useEffect, useState } from "react";
import type { SkillItem } from "@/types";
import { normalizeSkillName, uniqueSkillNames } from "@/lib/skills";

type Props = { value: string[]; onChange: (v: string[]) => void; max: number; disabled?: boolean };

export default function SkillPicker({ value, onChange, max, disabled }: Props) {
  const [q, setQ] = useState("");
  const [skills, setSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skills')
      .then(async (response) => {
        if (!response.ok) throw new Error('Skill taxonomy lookup failed');
        return response.json() as Promise<{ skills: SkillItem[] }>;
      })
      .then(({ skills: availableSkills }) => {
        if (!cancelled) setSkills(availableSkills);
      })
      .catch((error: unknown) => console.error('Error fetching skills:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSkills = uniqueSkillNames(value);
  const options = uniqueSkillNames([...skills.map((skill) => skill.name), ...selectedSkills]);

  const toggle = (skillName: string) => {
    const normalizedName = normalizeSkillName(skillName);
    if (selectedSkills.some((selected) => normalizeSkillName(selected) === normalizedName)) {
      onChange(selectedSkills.filter((selected) => normalizeSkillName(selected) !== normalizedName));
    } else if (selectedSkills.length < max) {
      onChange([...selectedSkills, skillName]);
    }
  };
  const add = () => {
    const typedName = q.trim();
    const normalizedName = normalizeSkillName(typedName);
    const canonicalName = options.find((skillName) => normalizeSkillName(skillName) === normalizedName) || typedName;
    if (normalizedName && !selectedSkills.some((skillName) => normalizeSkillName(skillName) === normalizedName) && selectedSkills.length < max) {
      onChange([...selectedSkills, canonicalName]);
    }
    setQ("");
  };

  return (
    <div inert={disabled} className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Don't see it? Type a skill and press Enter"
          aria-label="Add a skill"
          className="w-full rounded-xl border-2 border-ink/15 bg-mist-pure px-4 py-3 focus:border-lagoon text-ink placeholder:text-ink-muted/50 outline-none dark:bg-mist-subtle dark:border-white/15 dark:placeholder:text-ink-muted/40"
        />
        <button type="button" onClick={add} className="rounded-xl bg-ink px-5 font-medium text-white hover:bg-lagoon transition-colors dark:bg-saffron dark:text-black dark:hover:bg-saffron-light">Add</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((s) => {
          const on = selectedSkills.some((selected) => normalizeSkillName(selected) === normalizeSkillName(s));
          return (
            <button
              key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
              className={`rounded-full border-2 px-4 py-2 text-sm font-medium transition-colors ${
                on ? "border-lagoon bg-lagoon text-white" : "border-ink/15 bg-mist-pure text-ink hover:border-lagoon dark:bg-mist-subtle dark:border-white/15"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-ink/60">{value.length} of {max} selected</p>
    </div>
  );
}
