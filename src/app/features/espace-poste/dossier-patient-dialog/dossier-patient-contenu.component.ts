import { Component, Input, OnChanges, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { last } from 'rxjs/operators';
import {
  DocumentComplementaire, DossierPatient, FactureStructure, LIBELLES_PIECES, TypePiece
} from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';
import { ouvrirPdf, telecharger } from '../poste-facturation';

export interface PhotoDossier {
  cle: 'carte' | 'ticket' | 'feuille';
  titre: string;
  sousTitre: string;
  icone: string;
  image: string | null;
  chargement: boolean;
  erreur: boolean;
  telechargeablePdf?: boolean;
}

interface PieceAutre {
  type: TypePiece;
  libelle: string;
  image: string | null;
  erreur: boolean;
}

/**
 * Contenu du dossier patient :
 * - Affiche immédiatement les 3 photos essentielles :
 *   1. Carte d'assuré
 *   2. Ticket de caisse
 *   3. Feuille de soin (Attestation de soins)
 * - Propose une modale Lightbox haute définition avec zoom (+ / -, molette, 100%),
 *   rotation et déplacement (pan).
 * - Supprime définitivement l'ancienne fiche de l'assuré conformément à la demande.
 */
@Component({
  selector: 'app-dossier-patient-contenu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="flex flex-col gap-5">

      <!-- ============================================================
           GRILLE DES 3 PHOTOS MAJEURES DU DOSSIER
           ============================================================ -->
      <div>
        <div class="flex items-center justify-between pb-2 mb-3 border-b border-border-light">
          <div class="flex items-center gap-2">
            <mat-icon class="!text-lg !w-[18px] !h-[18px] text-primary">photo_library</mat-icon>
            <span class="text-[13px] font-bold uppercase tracking-wide text-text-primary">Photos du dossier patient</span>
          </div>
          <span class="text-[11.5px] text-text-muted hidden sm:inline">Cliquez sur une photo pour l'agrandir et zoomer</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <!-- 1. Carte d'assuré -->
          <ng-container [ngTemplateOutlet]="cartePhotoTpl" [ngTemplateOutletContext]="{ $implicit: photoCarte }"></ng-container>

          <!-- 2. Ticket de caisse -->
          <ng-container [ngTemplateOutlet]="cartePhotoTpl" [ngTemplateOutletContext]="{ $implicit: photoTicket }"></ng-container>

          <!-- 3. Feuille de soin -->
          <ng-container [ngTemplateOutlet]="cartePhotoTpl" [ngTemplateOutletContext]="{ $implicit: photoFeuille }"></ng-container>
        </div>
      </div>

      <!-- ============================================================
           AUTRES PIÈCES JUSTIFICATIVES (CNI, EXTRAIT...)
           ============================================================ -->
      <div *ngIf="autresPieces.length || autresDocuments.length" class="flex flex-col gap-2 pt-2 border-t border-border-light">
        <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
          <mat-icon class="!text-[16px] !w-4 !h-4">attach_file</mat-icon>
          Autres pièces justificatives
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <figure *ngFor="let p of autresPieces" class="m-0 flex flex-col gap-1">
            <div class="aspect-[4/3] rounded-lg border border-border bg-field flex items-center justify-center overflow-hidden">
              <mat-spinner *ngIf="!p.image && !p.erreur" diameter="20"></mat-spinner>
              <span *ngIf="p.erreur" class="text-[11px] text-text-muted px-2 text-center">Non disponible</span>
              <button type="button" *ngIf="p.image" (click)="ouvrirLightbox(p.libelle, p.image)" class="block w-full h-full cursor-zoom-in"
                      [attr.aria-label]="'Agrandir : ' + p.libelle">
                <img [src]="p.image" [alt]="p.libelle" class="w-full h-full object-contain bg-white">
              </button>
            </div>
            <figcaption class="text-[11.5px] font-semibold text-text-secondary truncate" [title]="p.libelle">{{ p.libelle }}</figcaption>
          </figure>
          <figure *ngFor="let d of autresDocuments" class="m-0 flex flex-col gap-1">
            <div class="aspect-[4/3] rounded-lg border border-border bg-white overflow-hidden">
              <button type="button" *ngIf="d.image" (click)="ouvrirLightbox(d.titre, d.image)" class="block w-full h-full cursor-zoom-in"
                      [attr.aria-label]="'Agrandir : ' + d.titre">
                <img [src]="d.image" [alt]="d.titre" class="w-full h-full object-contain">
              </button>
            </div>
            <figcaption class="text-[11.5px] font-semibold text-text-secondary truncate" [title]="d.titre">{{ d.titre }}</figcaption>
          </figure>
        </div>
      </div>

    </div>

    <!-- ============================================================
         GABARIT DE CARTE PHOTO
         ============================================================ -->
    <ng-template #cartePhotoTpl let-p>
      <div class="rounded-xl border border-border bg-white overflow-hidden flex flex-col shadow-sm transition-all hover:border-primary/50">
        <!-- En-tête -->
        <div class="p-3 border-b border-border-light flex items-center justify-between bg-field-bg/60">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
              <mat-icon class="!text-[16px] !w-4 !h-4">{{ p.icone }}</mat-icon>
            </div>
            <div class="min-w-0">
              <div class="text-[13px] font-bold text-text-primary leading-tight truncate">{{ p.titre }}</div>
              <div class="text-[11px] text-text-muted leading-tight truncate">{{ p.sousTitre }}</div>
            </div>
          </div>
          <span *ngIf="p.image && !p.chargement" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-light text-success shrink-0">
            Disponible
          </span>
          <span *ngIf="!p.image && !p.chargement" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-field-fill text-text-muted shrink-0">
            Non fournie
          </span>
        </div>

        <!-- Zone d'aperçu de l'image -->
        <div class="relative h-52 sm:h-56 bg-slate-50 flex items-center justify-center overflow-hidden group">
          <div *ngIf="p.chargement" class="flex flex-col items-center gap-2 text-text-muted text-[12px]">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Chargement…</span>
          </div>

          <ng-container *ngIf="p.image && !p.chargement">
            <img [src]="p.image" [alt]="p.titre" class="w-full h-full object-contain bg-white">
            <button type="button"
                    (click)="ouvrirLightbox(p.titre, p.image)"
                    class="absolute inset-0 w-full h-full bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-white cursor-zoom-in"
                    [attr.aria-label]="'Agrandir et zoomer : ' + p.titre">
              <div class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                <mat-icon class="!text-2xl !w-6 !h-6 text-white">zoom_in</mat-icon>
              </div>
              <span class="text-xs font-bold drop-shadow">Agrandir & Zoomer</span>
            </button>
          </ng-container>

          <div *ngIf="!p.image && !p.chargement" class="flex flex-col items-center gap-1.5 p-4 text-center text-text-muted">
            <mat-icon class="!text-3xl !w-8 !h-8 text-text-muted/50">{{ p.icone }}</mat-icon>
            <span class="text-xs font-medium">Aucune photo enregistrée</span>
            <button type="button" *ngIf="p.cle === 'feuille'" (click)="chargerFeuille()" class="btn btn-ghost btn-sm !text-xs !py-0.5 mt-1">
              <mat-icon class="!text-sm !w-3.5 !h-3.5">refresh</mat-icon> Réessayer
            </button>
          </div>
        </div>

        <!-- Actions pied de carte -->
        <div class="p-2.5 border-t border-border-light flex items-center justify-between gap-2 bg-field-bg/30">
          <button type="button"
                  *ngIf="p.image && !p.chargement"
                  (click)="ouvrirLightbox(p.titre, p.image)"
                  class="btn btn-outline btn-sm !text-xs !py-1 !px-2.5 flex-1 justify-center">
            <mat-icon class="!text-[15px] !w-4 !h-4">zoom_in</mat-icon>
            Agrandir & Zoomer
          </button>
          <span *ngIf="!p.image && !p.chargement" class="text-[11.5px] text-text-muted px-2 py-1">
            Non disponible
          </span>
          <button type="button"
                  *ngIf="p.telechargeablePdf && (p.image || feuilleSoins)"
                  (click)="telechargerFeuillePdf()"
                  [disabled]="telechargement === 'feuille'"
                  class="btn btn-ghost btn-sm !text-xs !py-1 !px-2 shrink-0"
                  title="Télécharger le PDF">
            <mat-icon class="!text-[15px] !w-4 !h-4">{{ telechargement === 'feuille' ? 'hourglass_top' : 'download' }}</mat-icon>
            PDF
          </button>
        </div>
      </div>
    </ng-template>

    <!-- ============================================================
         MODALE LIGHTBOX AVEC ZOOM ET PAN
         ============================================================ -->
    <div *ngIf="lightbox.ouvert"
         class="fixed inset-0 z-[3000] bg-slate-950/95 backdrop-blur-md flex flex-col select-none overflow-hidden"
         (click)="fermerLightbox()"
         (wheel)="onWheel($event)"
         (mousemove)="onDrag($event)"
         (mouseup)="stopDrag()">

      <!-- Barre d'outils supérieure -->
      <div class="h-14 px-4 bg-black/40 border-b border-white/10 flex items-center justify-between gap-3 text-white shrink-0"
           (click)="$event.stopPropagation()">
        <!-- Titre -->
        <div class="flex items-center gap-2 min-w-0">
          <button type="button" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  (click)="fermerLightbox()" aria-label="Fermer">
            <mat-icon class="!text-lg !w-5 !h-5">arrow_back</mat-icon>
          </button>
          <span class="font-bold text-[14.5px] truncate max-w-[200px] sm:max-w-md">{{ lightbox.titre }}</span>
        </div>

        <!-- Contrôles de zoom -->
        <div class="flex items-center gap-1.5 bg-white/10 rounded-xl p-1 border border-white/10">
          <button type="button" (click)="zoomer(-0.25)" class="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white transition-colors"
                  title="Zoom arrière (-)">
            <mat-icon class="!text-lg !w-5 !h-5">remove</mat-icon>
          </button>
          <span class="w-14 text-center text-[12px] font-mono font-bold">{{ Math.round(lightbox.zoom * 100) }}%</span>
          <button type="button" (click)="zoomer(0.25)" class="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white transition-colors"
                  title="Zoom avant (+)">
            <mat-icon class="!text-lg !w-5 !h-5">add</mat-icon>
          </button>
          <button type="button" (click)="reinitialiserZoom()" class="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white transition-colors"
                  title="Réinitialiser le zoom (0)">
            <mat-icon class="!text-lg !w-5 !h-5">restart_alt</mat-icon>
          </button>
          <button type="button" (click)="tourner()" class="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white transition-colors"
                  title="Pivoter de 90°">
            <mat-icon class="!text-lg !w-5 !h-5">rotate_right</mat-icon>
          </button>
        </div>

        <!-- Actions droites -->
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn btn-sm border-0 bg-white/15 text-white hover:bg-white/25 hidden sm:inline-flex"
                  (click)="telechargerImage()" title="Télécharger cette photo">
            <mat-icon class="!text-base !w-4 !h-4">download</mat-icon>
            Télécharger
          </button>
          <button type="button" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  (click)="fermerLightbox()" aria-label="Fermer">
            <mat-icon class="!text-lg !w-5 !h-5">close</mat-icon>
          </button>
        </div>
      </div>

      <!-- Zone de visualisation -->
      <div class="flex-1 relative flex items-center justify-center overflow-hidden p-4"
           [class.cursor-grab]="lightbox.zoom > 1 && !lightbox.isDragging"
           [class.cursor-grabbing]="lightbox.isDragging">
        <img [src]="lightbox.image"
             [alt]="lightbox.titre"
             (mousedown)="startDrag($event)"
             (touchstart)="onTouchStart($event)"
             (touchmove)="onTouchMove($event)"
             (touchend)="stopDrag()"
             (click)="$event.stopPropagation()"
             class="max-w-[92vw] max-h-[80vh] object-contain transition-transform duration-75 ease-out shadow-2xl"
             [style.transform]="'translate(' + lightbox.panX + 'px, ' + lightbox.panY + 'px) scale(' + lightbox.zoom + ') rotate(' + lightbox.rotation + 'deg)'">
      </div>

      <!-- Barre d'aide discrète en bas -->
      <div class="h-9 px-4 bg-black/50 border-t border-white/10 flex items-center justify-between text-[11.5px] text-white/60 shrink-0">
        <span class="flex items-center gap-1.5">
          <mat-icon class="!text-[14px] !w-3.5 !h-3.5 text-white/50">mouse</mat-icon>
          Molette pour zoomer • Glisser pour déplacer
        </span>
        <span class="hidden sm:inline">Raccourcis : + / - pour zoomer • 0 pour réinitialiser • Échap pour fermer</span>
      </div>
    </div>
  `
})
export class DossierPatientContenuComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) facture!: FactureStructure;
  @Input({ required: true }) dossier!: DossierPatient;
  @Input() documents?: DocumentComplementaire[];
  @Input() feuilleSoins?: { id: string; numero: string };

  readonly Math = Math;

  // Les 3 photos du dossier
  photoCarte: PhotoDossier = {
    cle: 'carte',
    titre: "Carte d'assuré",
    sousTitre: "Photo de la carte CSU",
    icone: 'badge',
    image: null,
    chargement: false,
    erreur: false
  };

  photoTicket: PhotoDossier = {
    cle: 'ticket',
    titre: "Ticket de caisse",
    sousTitre: "Reçu de paiement",
    icone: 'receipt',
    image: null,
    chargement: false,
    erreur: false
  };

  photoFeuille: PhotoDossier = {
    cle: 'feuille',
    titre: "Feuille de soin",
    sousTitre: "Attestation de prise en charge",
    icone: 'assignment',
    image: null,
    chargement: false,
    erreur: false,
    telechargeablePdf: true
  };

  // Pièces complémentaires additionnelles
  autresPieces: PieceAutre[] = [];
  autresDocuments: DocumentComplementaire[] = [];

  telechargement: 'feuille' | null = null;
  private feuilleObjectUrl: string | null = null;
  private dejaLu = '';

  // État de la modale Lightbox avec Zoom & Pan
  lightbox = {
    ouvert: false,
    titre: '',
    image: '',
    zoom: 1,
    rotation: 0,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };

  constructor(
    private structureService: StructureService,
    private feuilleSoinsService: FeuilleSoinsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnChanges() {
    const { facture, dossier } = this;
    const cle = [
      facture.id,
      dossier.id,
      dossier.updatedAt,
      (dossier.pieces || []).join(','),
      (this.documents || []).length,
      (facture.documentsComplementaires || []).length
    ].join('|');

    if (cle === this.dejaLu) return;
    this.dejaLu = cle;
    this.fermerLightbox();

    // 1. Charger la photo de la carte d'assuré
    this.chargerCarte();

    // 2. Charger la photo du ticket de caisse
    this.chargerTicket();

    // 3. Charger la feuille de soin
    this.chargerFeuille();

    // 4. Charger d'éventuelles autres pièces (CNI, extrait...)
    this.chargerAutresPieces();
  }

  chargerCarte() {
    this.photoCarte.chargement = true;
    this.photoCarte.erreur = false;
    this.photoCarte.image = null;

    this.structureService.getPiece(this.facture.id, this.dossier.id, 'CARTE_ASSURE').pipe(last()).subscribe({
      next: lue => {
        if (lue && lue.image) {
          this.photoCarte.image = lue.image;
          this.photoCarte.chargement = false;
        } else {
          this.fallbackCarte();
        }
      },
      error: () => this.fallbackCarte()
    });
  }

  private fallbackCarte() {
    this.structureService.getPiece(this.facture.id, this.dossier.id, 'PHOTO_ASSURE').pipe(last()).subscribe({
      next: lue => {
        if (lue && lue.image) {
          this.photoCarte.image = lue.image;
          this.photoCarte.chargement = false;
        } else {
          this.checkDocCarte();
        }
      },
      error: () => this.checkDocCarte()
    });
  }

  private checkDocCarte() {
    const doc = (this.documents || []).find(d => d.image && /carte|assur/i.test(d.titre));
    if (doc && doc.image) {
      this.photoCarte.image = doc.image;
      this.photoCarte.chargement = false;
    } else {
      this.photoCarte.chargement = false;
      this.photoCarte.erreur = true;
    }
  }

  chargerTicket() {
    this.photoTicket.chargement = true;
    this.photoTicket.erreur = false;
    this.photoTicket.image = null;

    this.structureService.getPiece(this.facture.id, this.dossier.id, 'TICKET_CAISSE').pipe(last()).subscribe({
      next: lue => {
        if (lue && lue.image) {
          this.photoTicket.image = lue.image;
          this.photoTicket.chargement = false;
        } else {
          this.checkDocTicket();
        }
      },
      error: () => this.checkDocTicket()
    });
  }

  private checkDocTicket() {
    const doc = (this.documents || []).find(d => d.image && /ticket|caisse|recu|paiement/i.test(d.titre));
    if (doc && doc.image) {
      this.photoTicket.image = doc.image;
      this.photoTicket.chargement = false;
    } else {
      this.photoTicket.chargement = false;
      this.photoTicket.erreur = true;
    }
  }

  chargerFeuille() {
    this.photoFeuille.chargement = true;
    this.photoFeuille.erreur = false;
    this.photoFeuille.image = null;

    if (this.feuilleObjectUrl) {
      URL.revokeObjectURL(this.feuilleObjectUrl);
      this.feuilleObjectUrl = null;
    }

    this.structureService.attestationSoinsImage(this.facture.id, this.dossier.id).subscribe({
      next: blob => {
        try {
          this.feuilleObjectUrl = URL.createObjectURL(blob);
          this.photoFeuille.image = this.feuilleObjectUrl;
          this.photoFeuille.chargement = false;
        } catch {
          this.checkDocFeuille();
        }
      },
      error: () => this.checkDocFeuille()
    });
  }

  private checkDocFeuille() {
    const doc = (this.documents || []).find(d => d.image && /feuille|soin|attestation/i.test(d.titre));
    if (doc && doc.image) {
      this.photoFeuille.image = doc.image;
      this.photoFeuille.chargement = false;
    } else {
      this.photoFeuille.chargement = false;
      this.photoFeuille.erreur = true;
    }
  }

  private chargerAutresPieces() {
    this.autresPieces = (this.dossier.pieces || [])
      .filter(t => t !== 'CARTE_ASSURE' && t !== 'TICKET_CAISSE' && t !== 'PHOTO_ASSURE')
      .map(type => ({ type, libelle: LIBELLES_PIECES[type] || type, image: null, erreur: false }));

    this.autresPieces.forEach(piece => {
      this.structureService.getPiece(this.facture.id, this.dossier.id, piece.type).pipe(last()).subscribe({
        next: lue => piece.image = lue.image,
        error: () => piece.erreur = true
      });
    });

    const parMatricule = this.dossier.matricule
      ? (this.facture.documentsComplementaires || []).filter(d => d.patientMatricule === this.dossier.matricule && d.image)
      : [];
    const fournis = (this.documents || []).filter(d => d.image);
    this.autresDocuments = [...fournis, ...parMatricule.filter(d => !fournis.includes(d))]
      .filter(d => !/carte|assur|ticket|caisse|feuille|soin/i.test(d.titre));
  }

  // ============================================================
  // GESTION DU ZOOM ET DU LIGHTBOX
  // ============================================================
  ouvrirLightbox(titre: string, image: string | null) {
    if (!image) return;
    this.lightbox = {
      ouvert: true,
      titre,
      image,
      zoom: 1,
      rotation: 0,
      panX: 0,
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };
  }

  fermerLightbox() {
    this.lightbox.ouvert = false;
    this.reinitialiserZoom();
  }

  zoomer(delta: number) {
    const nouveauZoom = Math.min(Math.max(this.lightbox.zoom + delta, 0.5), 5);
    this.lightbox.zoom = Math.round(nouveauZoom * 100) / 100;
    if (this.lightbox.zoom <= 1) {
      this.lightbox.panX = 0;
      this.lightbox.panY = 0;
    }
  }

  reinitialiserZoom() {
    this.lightbox.zoom = 1;
    this.lightbox.rotation = 0;
    this.lightbox.panX = 0;
    this.lightbox.panY = 0;
  }

  tourner() {
    this.lightbox.rotation = (this.lightbox.rotation + 90) % 360;
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.25 : -0.25;
    this.zoomer(delta);
  }

  startDrag(event: MouseEvent) {
    if (this.lightbox.zoom <= 1) return;
    this.lightbox.isDragging = true;
    this.lightbox.startX = event.clientX - this.lightbox.panX;
    this.lightbox.startY = event.clientY - this.lightbox.panY;
  }

  onDrag(event: MouseEvent) {
    if (!this.lightbox.isDragging) return;
    this.lightbox.panX = event.clientX - this.lightbox.startX;
    this.lightbox.panY = event.clientY - this.lightbox.startY;
  }

  stopDrag() {
    this.lightbox.isDragging = false;
  }

  onTouchStart(event: TouchEvent) {
    if (this.lightbox.zoom <= 1 || event.touches.length !== 1) return;
    this.lightbox.isDragging = true;
    this.lightbox.startX = event.touches[0].clientX - this.lightbox.panX;
    this.lightbox.startY = event.touches[0].clientY - this.lightbox.panY;
  }

  onTouchMove(event: TouchEvent) {
    if (!this.lightbox.isDragging || event.touches.length !== 1) return;
    this.lightbox.panX = event.touches[0].clientX - this.lightbox.startX;
    this.lightbox.panY = event.touches[0].clientY - this.lightbox.startY;
  }

  telechargerImage() {
    if (!this.lightbox.image) return;
    const link = document.createElement('a');
    link.href = this.lightbox.image;
    link.download = `${this.lightbox.titre.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  telechargerFeuillePdf() {
    if (this.feuilleSoins?.id) {
      this.telechargement = 'feuille';
      this.feuilleSoinsService.exportPdf(this.feuilleSoins.id).subscribe({
        next: blob => {
          this.telechargement = null;
          ouvrirPdf(blob, `feuille_soins_${this.feuilleSoins?.numero || 'patient'}.pdf`);
        },
        error: err => this.echec(err)
      });
      return;
    }

    this.telechargement = 'feuille';
    this.structureService.attestationSoinsPdf(this.facture.id, this.dossier.id).subscribe({
      next: blob => {
        this.telechargement = null;
        telecharger(blob, 'attestation_soins.pdf');
      },
      error: err => this.echec(err)
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.lightbox.ouvert) return;
    if (event.key === 'Escape') {
      this.fermerLightbox();
    } else if (event.key === '+' || event.key === '=') {
      this.zoomer(0.25);
    } else if (event.key === '-' || event.key === '_') {
      this.zoomer(-0.25);
    } else if (event.key === '0') {
      this.reinitialiserZoom();
    }
  }

  ngOnDestroy() {
    if (this.feuilleObjectUrl) {
      URL.revokeObjectURL(this.feuilleObjectUrl);
      this.feuilleObjectUrl = null;
    }
  }

  private echec(err: any) {
    this.telechargement = null;
    this.snackBar.open(err?.error?.message || 'Document indisponible.', 'Fermer', { duration: 4000 });
  }
}
