import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Autosaver, type SaveStatus } from '../lib/autosave';

/**
 * Autosaving text state: returns the current text, a setter that schedules a save, the
 * save status, and `flush` for blur. Pending text is saved when the app goes to the
 * background and when the component unmounts (e.g. switching dates or tabs).
 */
export function useAutosave(initial: string, save: (value: string) => Promise<void>, delayMs = 800) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const saveRef = useRef(save);
  saveRef.current = save;
  const saver = useRef<Autosaver<string> | null>(null);
  if (!saver.current) saver.current = new Autosaver<string>((v) => saveRef.current(v), delayMs);

  useEffect(() => {
    const s = saver.current!;
    const unsub = s.subscribe(setStatus);
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') void s.flush();
    });
    return () => {
      unsub();
      sub.remove();
      void s.flush();
    };
  }, []);

  return {
    text,
    status,
    setText: (v: string) => {
      setText(v);
      saver.current!.update(v);
    },
    flush: () => saver.current!.flush(),
  };
}
