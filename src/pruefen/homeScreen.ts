import { useEffect } from 'react';

/**
 * „Zum Home-Bildschirm“ am iPhone: Symbol und Name der App statt des allgemeinen Dashboards, solange dieser
 * Bereich offen ist (Safari liest beides beim Hinzufügen aus der Seite). Gleiches Vorgehen wie bei WinterDex.
 * @param icon Pfad eines 180-px-Symbols ohne Durchsicht, z. B. /icons/leiterdex-180.png
 */
export function useHomeScreenIcon(title: string, icon: string) {
  useEffect(() => {
    const head = document.head;
    const link = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const beforeIcon = link?.getAttribute('href') ?? null;
    const beforeTitle = document.title;
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-title';
    meta.content = title;
    head.appendChild(meta);
    link?.setAttribute('href', icon);
    document.title = title;
    return () => {
      meta.remove();
      if (link && beforeIcon) link.setAttribute('href', beforeIcon);
      document.title = beforeTitle;
    };
  }, [title, icon]);
}
