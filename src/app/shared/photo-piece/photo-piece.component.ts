import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  canvasVersBlob, chargerImageReduite, compresserCanvas, libererCanvas
} from '../../core/utils/image-compression';
import { libererOcr } from '../../core/utils/document-ocr';
import { CameraDialogComponent, CameraDialogData } from './camera-dialog.component';

/** Présence d'une caméra, vérifiée une fois (null tant qu'on ne sait pas). */
let cameraPresente: boolean | null = null;

function verifierCamera() {
  if (cameraPresente !== null || !navigator.mediaDevices?.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices()
    .then(appareils => cameraPresente = appareils.some(appareil => appareil.kind === 'videoinput'))
    .catch(() => cameraPresente = true);
}

/**
 * Prise de photo d'une pièce justificative : la photo prise est acceptée telle quelle.
 *
 * Aucun contrôle de qualité ni de format (demande du 14/10/2026) : ni analyse de netteté,
 * de luminosité ou de cadrage, ni refus. Seule une image illisible par le navigateur est
 * signalée. La photo est compressée pour le réseau mobile.
 *
 * La photo se prend dans la page (caméra intégrée) : avec l'appareil photo du téléphone, la
 * page passait en arrière-plan et le téléphone la rechargeait souvent au retour, saisie
 * perdue. Il reste le repli quand la caméra intégrée est indisponible (page hors HTTPS).
 */
@Component({
  selector: 'app-photo-piece',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[13px] font-semibold text-text-primary">
          {{ libelle }}
          <span *ngIf="obligatoire" class="text-warn">*</span>
          <span *ngIf="!obligatoire" class="font-normal text-text-secondary">(facultatif)</span>
        </span>
        <span *ngIf="image" class="inline-flex items-center gap-1 text-[11.5px] font-bold text-success">
          <mat-icon class="!text-sm !w-3.5 !h-3.5">check_circle</mat-icon> Photo prise
        </span>
      </div>

      <input type="file" accept="image/*" capture="environment" hidden #entree (change)="choisir($event)">
      <input type="file" accept="image/*" hidden #galerieEntree (change)="choisir($event)">

      <div *ngIf="!image && !analyse"
           class="flex flex-col items-center justify-center gap-2 min-h-[120px] p-4 rounded-lg border border-dashed
                  text-center"
           [ngClass]="erreur ? 'border-warn bg-warn-light' : 'border-border bg-field'">
        <button type="button" class="btn btn-sm btn-outline" [disabled]="desactive" (click)="prendrePhoto(entree)">
          <mat-icon>photo_camera</mat-icon> {{ erreur ? 'Reprendre la photo' : 'Prendre en photo' }}
        </button>
        <button type="button" *ngIf="galerie" [disabled]="desactive" (click)="avantSortie(); galerieEntree.click()"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[12px] font-semibold text-text-secondary
                       bg-transparent border-0 cursor-pointer hover:text-primary hover:underline">
          <mat-icon class="!text-base !w-4 !h-4">image</mat-icon> Importer depuis la galerie
        </button>
        <span *ngIf="!erreur && aide" class="text-[11.5px] text-text-secondary">{{ aide }}</span>
      </div>

      <div *ngIf="analyse" class="flex items-center justify-center gap-2 min-h-[120px] rounded-lg border border-border bg-field">
        <mat-spinner diameter="22"></mat-spinner>
        <span class="text-[13px] text-text-secondary">Préparation de la photo…</span>
      </div>

      <div *ngIf="image && !analyse" class="relative overflow-hidden rounded-lg border border-border bg-white">
        <img [src]="image" [alt]="libelle" class="block w-full max-h-[220px] object-contain cursor-zoom-in"
             (click)="agrandi = !agrandi" [class.max-h-none]="agrandi">
        <div *ngIf="!desactive" class="absolute top-1.5 right-1.5 flex gap-1.5">
          <button type="button" (click)="prendrePhoto(entree)" aria-label="Reprendre la photo" title="Reprendre"
                  class="w-8 h-8 flex items-center justify-center rounded-full bg-black/55 text-white">
            <mat-icon class="!text-base !w-4 !h-4">photo_camera</mat-icon>
          </button>
          <button type="button" (click)="retirer()" aria-label="Retirer la photo" title="Retirer"
                  class="w-8 h-8 flex items-center justify-center rounded-full bg-black/55 text-white">
            <mat-icon class="!text-base !w-4 !h-4">close</mat-icon>
          </button>
        </div>
      </div>

      <div *ngIf="erreur" role="alert"
           class="flex items-start gap-2 py-2 px-3 rounded-lg bg-warn-light text-warn text-[12.5px]">
        <mat-icon class="shrink-0 !text-lg !w-[18px] !h-[18px]">error_outline</mat-icon>
        <div>
          <strong class="block">{{ erreur }}</strong>
          <span *ngIf="!obligatoire" class="block mt-1 text-text-secondary">
            Cette pièce est facultative : vous pouvez poursuivre sans elle.
          </span>
        </div>
      </div>
    </div>
  `
})
export class PhotoPieceComponent {
  @Input() libelle = 'Photo';
  @Input() obligatoire = false;
  @Input() aide = '';
  @Input() desactive = false;
  /** Propose aussi l'import d'une photo déjà prise (galerie, fichier). */
  @Input() galerie = false;
  /** Poids visé après compression (Ko) : assez pour relire une CNI. */
  @Input() tailleMaxKo = 200;
  /** Photo déjà acceptée (data URL), ou null. */
  @Input() image: string | null = null;
  /** Photo acceptée (data URL compressée) ou null quand elle est retirée. */
  @Output() imageChange = new EventEmitter<string | null>();
  /** Photo acceptée en bonne définition (JPEG ≤ 2400 px) — pour une lecture automatique (OCR). */
  @Output() fichierAccepte = new EventEmitter<File>();
  /**
   * Le téléphone va ouvrir son appareil photo ou sa galerie (repli) : la page passe en
   * arrière-plan et peut être rechargée au retour — c'est le moment de garder la saisie.
   */
  @Output() sortiePage = new EventEmitter<void>();

  analyse = false;
  agrandi = false;
  erreur = '';

  constructor(private dialog: MatDialog) {
    verifierCamera();
  }

  /**
   * Caméra intégrée si le navigateur l'offre (HTTPS) et qu'il y a une caméra ; sinon
   * l'appareil photo du téléphone, ou le choix d'un fichier sur un poste sans webcam.
   */
  prendrePhoto(entreeNative: HTMLInputElement) {
    if (!navigator.mediaDevices?.getUserMedia || cameraPresente === false) {
      this.avantSortie();
      entreeNative.click();
      return;
    }
    this.dialog.open<CameraDialogComponent, CameraDialogData, Blob>(CameraDialogComponent, {
      data: { libelle: this.libelle, avantAppareilNatif: () => this.avantSortie() },
      panelClass: 'dialog-camera',
      width: '100vw', maxWidth: '100vw', height: '100%', maxHeight: '100%',
      autoFocus: false
    }).afterClosed().subscribe(photo => {
      if (photo) void this.traiter(photo);
    });
  }

  avantSortie() {
    libererOcr();
    this.sortiePage.emit();
  }

  choisir(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const fichier = entree.files?.[0];
    entree.value = '';
    if (fichier) void this.traiter(fichier);
  }

  /**
   * Acceptation d'une photo, sans contrôle. Elle n'est décodée qu'une fois, dans un canvas
   * réduit d'où l'on tire la pièce compressée et l'image à lire : décoder plusieurs fois une
   * photo de 12 Mpx suffisait à saturer la mémoire d'un téléphone modeste.
   */
  private async traiter(fichier: Blob) {
    this.erreur = '';
    if (fichier.type && !fichier.type.startsWith('image/')) {
      this.erreur = 'Le fichier choisi n\'est pas une image.';
      return;
    }
    this.analyse = true;
    let travail: HTMLCanvasElement | null = null;
    try {
      travail = await chargerImageReduite(fichier, 2400);
      // ~200 Ko par défaut : assez pour relire une CNI, assez peu pour un réseau mobile.
      const image = compresserCanvas(travail, this.tailleMaxKo * 1024);
      const aLire = this.fichierAccepte.observed ? await canvasVersBlob(travail, 'image/jpeg', 0.95) : null;
      this.image = image;
      this.agrandi = false;
      this.imageChange.emit(image);
      if (aLire) this.fichierAccepte.emit(new File([aLire], 'piece.jpg', { type: 'image/jpeg' }));
    } catch {
      this.erreur = 'Impossible de traiter cette photo. Reprenez-la.';
    } finally {
      if (travail) libererCanvas(travail);
      this.analyse = false;
    }
  }

  retirer() {
    this.image = null;
    this.erreur = '';
    this.imageChange.emit(null);
  }
}
