import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const tried = new Set<string>();
const found = new Map<string, string>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

// Junta os pedidos e busca até 30 fotos por vez, uma única tentativa por contato a cada visita.
function ask(id: string) {
  if (tried.has(id)) return;
  tried.add(id);
  queue.push(id);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
async function flush() {
  while (queue.length) {
    const ids = queue.splice(0, 30);
    const { data } = await supabase!.functions.invoke('whatsapp-avatar', { body: { ids } });
    Object.entries((data?.photos || {}) as Record<string, string>).forEach(([k, v]) => found.set(k, v));
    listeners.forEach(f => f());
  }
}

export default function ContactAvatar({ id, name, url, className }: { id?: string; name: string; url?: string | null; className: string }) {
  const [, render] = useState(0);
  const [broken, setBroken] = useState('');
  const src = (id && found.get(id)) || url || '';
  const show = !!src && src !== broken;
  useEffect(() => { const f = () => render(n => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  useEffect(() => { if (id && !show) ask(id); }, [id, show]);
  return (
    <span className={className}>
      {show ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(src)} /> : name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}
