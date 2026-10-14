import {
  Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TEINTES, Teinte } from '../teintes';

/** Durée du décompte d'un chiffre qui change. */
const DUREE_DECOMPTE_MS = 700;

/**
 * Dernier nombre affiché par indicateur (écran + libellé), pour toute la session : revenir sur
 * un écran ne refait pas défiler ses chiffres depuis 0 — on croirait qu'il recharge tout. Seul
 * un chiffre qui a réellement changé depuis la dernière visite défile, depuis l'ancienne valeur.
 */
const derniersNombres = new Map<string, number>();

/** Nombre entier lu dans une valeur affichée (« 12 345 F », 42…), avec ce qui l'entoure. */
interface ValeurChiffree {
  nombre: number;
  avant: string;
  apres: string;
  /** La valeur d'origine sépare les milliers (« 12 345 ») : le décompte aussi. */
  milliers: boolean;
}

/**
 * Indicateur chiffré d'un tableau de bord, aux couleurs des espaces (poste de santé).
 *
 * Quand le chiffre arrive ou change, il défile jusqu'à sa valeur (décompte) au lieu d'apparaître
 * d'un coup. Le décompte tourne hors d'Angular et écrit directement dans le DOM : pas de
 * détection de changements à chaque image.
 */
@Component({
  selector: 'app-indicateur',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  host: { class: 'block' },
  template: `
    <div class="h-full flex items-center gap-4 p-5 rounded-2xl border border-border bg-white shadow-sm transition duration-200"
         [ngClass]="cliquable ? ['cursor-pointer', 'hover:shadow-md', 'hover:-translate-y-0.5', 'active:translate-y-0', teintes.survol] : []">
      <span class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" [ngClass]="teintes.pastille">
        <mat-icon>{{ icone }}</mat-icon>
      </span>
      <span class="min-w-0">
        <span #valeurAffichee class="block text-[22px] font-bold text-text-primary leading-tight truncate tabular-nums"></span>
        <span class="block text-[12.5px] font-medium text-text-secondary">{{ libelle }}</span>
      </span>
    </div>
  `
})
export class IndicateurComponent implements OnChanges, OnInit, OnDestroy {
  @Input() icone = 'insights';
  @Input() valeur: string | number | null = null;
  @Input() libelle = '';
  @Input() teinte: Teinte = 'primary';
  @Input() cliquable = false;

  @ViewChild('valeurAffichee', { static: true }) valeurAffichee?: ElementRef<HTMLElement>;

  private dernierNombre: number | null = null;
  private image = 0;
  private affiche = false;

  constructor(private zone: NgZone) {}

  get teintes() {
    return TEINTES[this.teinte] || TEINTES.primary;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['valeur']) this.afficher();
  }

  ngOnInit() {
    if (!this.affiche) this.afficher();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.image);
  }

  private afficher() {
    const element = this.valeurAffichee?.nativeElement;
    if (!element) return;
    this.affiche = true;
    cancelAnimationFrame(this.image);
    const texte = this.valeur == null ? '' : String(this.valeur);
    const cible = lireValeur(this.valeur);
    const cle = `${location.pathname}|${this.libelle}`;
    const depart = this.dernierNombre ?? derniersNombres.get(cle) ?? 0;
    this.dernierNombre = cible?.nombre ?? null;
    if (cible) derniersNombres.set(cle, cible.nombre);

    if (!cible || cible.nombre === depart || animationsReduites()) {
      element.textContent = texte;
      return;
    }
    const debut = performance.now();
    this.zone.runOutsideAngular(() => {
      const pas = (maintenant: number) => {
        const avancement = Math.min(1, (maintenant - debut) / DUREE_DECOMPTE_MS);
        const amorti = 1 - Math.pow(1 - avancement, 3);
        if (avancement < 1) {
          const nombre = Math.round(depart + (cible.nombre - depart) * amorti);
          element.textContent = cible.avant
            + (cible.milliers ? nombre.toLocaleString('fr-FR') : String(nombre)) + cible.apres;
          this.image = requestAnimationFrame(pas);
        } else {
          element.textContent = texte; // la valeur exacte, telle que le parent l'a formatée
        }
      };
      this.image = requestAnimationFrame(pas);
    });
  }
}

/** Entier (éventuellement séparé en milliers) entouré de texte, sinon null (« … », « 85,5 % »). */
function lireValeur(valeur: string | number | null): ValeurChiffree | null {
  if (typeof valeur === 'number') {
    return Number.isInteger(valeur) ? { nombre: valeur, avant: '', apres: '', milliers: false } : null;
  }
  const m = (valeur || '').match(/^(\D*?)(\d{1,3}(?:[\s  ]\d{3})+|\d+)(\D*)$/);
  if (!m) return null;
  const milliers = /[\s  ]/.test(m[2]);
  return { nombre: Number(m[2].replace(/\D/g, '')), avant: m[1], apres: m[3], milliers };
}

function animationsReduites(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
