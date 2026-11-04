import { TextStyle } from '@framecast/schema';
import { commands } from '../../editor/commands';
import { TEXT_PRESETS } from '../../editor/factories';

export function TextPanel() {
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {TEXT_PRESETS.map((p) => {
        const sample = p.make(0);
        const s = TextStyle.parse(sample.style);
        return (
          <button key={p.id} type="button" onClick={() => commands.addText(p.id)} className="flex aspect-video flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-zinc-800 to-zinc-900 p-2 text-center transition hover:border-accent">
            <span className="max-w-full truncate rounded px-1.5" style={{ fontFamily: s.fontFamily, fontWeight: s.fontWeight, color: s.color, background: s.background ?? undefined, fontSize: 13 }}>
              {sample.text.split('\n')[0]}
            </span>
            <span className="text-2xs text-zinc-400">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
