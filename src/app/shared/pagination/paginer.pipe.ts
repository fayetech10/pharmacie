import { Pipe, PipeTransform } from '@angular/core';

/**
 * Page réellement affichable : la page demandée, ramenée dans les bornes de la liste.
 *
 * <p>Une liste qui rétrécit (filtre, suppression) laisserait sinon une page vide. On
 * borne au lieu de remettre la page à zéro : modifier l'état pendant la détection de
 * changements déclencherait « ExpressionChangedAfterItHasBeenChecked ».</p>
 */
export function pageEffective(page: number, taille: number, total: number): number {
  const derniere = Math.max(0, Math.ceil(total / Math.max(1, taille)) - 1);
  return Math.min(Math.max(0, page || 0), derniere);
}

/**
 * Découpe une liste pour la page courante d'un {@link PaginationComponent} :
 * `*ngFor="let x of liste | paginer: pg.page : pg.taille"` avec `<app-pagination #pg [total]="liste.length">`.
 */
@Pipe({ name: 'paginer', standalone: true })
export class PaginerPipe implements PipeTransform {
  transform<T>(liste: readonly T[] | null | undefined, page: number, taille: number): T[] {
    if (!liste?.length) return [];
    const p = pageEffective(page, taille, liste.length);
    return liste.slice(p * taille, p * taille + taille);
  }
}
