import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
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
import { exigeCartePoste, ouvrirPdf, telecharger } from '../poste-facturation';

interface PieceAffichee { type: TypePiece; libelle: string; image: string | null; erreur: boolean; }
/**
 * Aperçu d'un document du dossier : image JPEG rendue par le serveur à partir du PDF, exposée en
 * blob URL (`objectUrl`, à révoquer pour libérer la mémoire). Une image s'affiche sur tous les
 * appareils, alors qu'un PDF dans un `<iframe>` reste vide sur Chrome Android.
 */
interface ApercuDocument { label: 'fiche' | 'attestation'; objectUrl: string | null; chargement: boolean; erreur: boolean; }

/**
 * Contenu du « dossier patient » : la fiche assuré et l'attestation de soins sont affichées en
 * aperçu image (agrandissable) ; « Télécharger » donne le PDF. Le ticket de caisse reste téléchargeable.
 */
@Component({
  selector: 'app-dossier-patient-contenu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <!-- Aperçu plein écran d'une pièce jointe photo -->
    <div *ngIf="apercu">
      <button type="button" class="btn btn-ghost btn-sm mb-2" (click)="apercu = null">
        <mat-icon>arrow_back</mat-icon> Retour au dossier
      </button>
      <img [src]="apercu" alt="Pièce justificative" class="block w-full rounded-lg border border-border bg-white">
    </div>

    <div *ngIf="!apercu" class="flex flex-col gap-4">

      <!-- Informations de l'assuré (aperçu cliquable) -->
      <ng-container *ngIf="aCarte" [ngTemplateOutlet]="sectionDocument" [ngTemplateOutletContext]="{
        $implicit: fiche, titre: 'Informations de l\\'assuré', icone: 'badge',
        nom: 'fiche_assure.pdf', recharger: rechargerFiche }"></ng-container>

      <!-- Attestation de soins (aperçu cliquable) -->
      <ng-container [ngTemplateOutlet]="sectionDocument" [ngTemplateOutletContext]="{
        $implicit: attestation, titre: 'Attestation de soins', icone: 'assignment',
        nom: 'attestation_soins.pdf', recharger: rechargerAttestation }"></ng-container>

      <!-- Ticket de caisse / Feuille de soins (PDF téléchargeable) -->
      <div *ngIf="feuilleSoins as feuille" class="flex flex-col gap-1">
        <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted pb-1 border-b border-border-light">
          <mat-icon class="!text-base !w-4 !h-4">description</mat-icon>
          Ticket de caisse
        </div>
        <button type="button" class="btn btn-outline justify-start"
                [disabled]="telechargement === 'feuille'" (click)="imprimerFeuille(feuille.id, feuille.numero)">
          <mat-icon>description</mat-icon>
          <span class="flex-1 text-left">Feuille de soins {{ feuille.numero }} (PDF)</span>
          <mat-spinner *ngIf="telechargement === 'feuille'" diameter="16"></mat-spinner>
        </button>
      </div>

      <!-- Pièces jointes (photos) -->
      <div *ngIf="pieces.length || documentsAffiches.length" class="flex flex-col gap-2">
        <div class="text-[12px] font-semibold uppercase tracking-wide text-text-muted pb-1 border-b border-border-light">
          Pièces jointes
        </div>
        <div class="grid grid-cols-2 gap-3">
          <figure *ngFor="let p of pieces" class="m-0 flex flex-col gap-1">
            <div class="aspect-[4/3] rounded-lg border border-border bg-field flex items-center justify-center overflow-hidden">
              <mat-spinner *ngIf="!p.image && !p.erreur" diameter="20"></mat-spinner>
              <span *ngIf="p.erreur" class="text-[12px] text-warn px-2 text-center">Photo illisible</span>
              <button type="button" *ngIf="p.image" (click)="apercu = p.image" class="block w-full h-full cursor-zoom-in"
                      [attr.aria-label]="'Agrandir : ' + p.libelle">
                <img [src]="p.image" [alt]="p.libelle" class="w-full h-full object-contain bg-white">
              </button>
            </div>
            <figcaption class="text-[12.5px] font-semibold text-text-secondary">{{ p.libelle }}</figcaption>
          </figure>
          <figure *ngFor="let d of documentsAffiches" class="m-0 flex flex-col gap-1">
            <div class="aspect-[4/3] rounded-lg border border-border bg-white overflow-hidden">
              <button type="button" *ngIf="d.image" (click)="apercu = d.image!" class="block w-full h-full cursor-zoom-in"
                      [attr.aria-label]="'Agrandir : ' + d.titre">
                <img [src]="d.image" [alt]="d.titre" class="w-full h-full object-contain">
              </button>
            </div>
            <figcaption class="text-[12.5px] font-semibold text-text-secondary">{{ d.titre }}</figcaption>
          </figure>
        </div>
      </div>

    </div>

    <!-- Gabarit d'une section document : aperçu cliquable (image du document) + télécharger -->
    <ng-template #sectionDocument let-cible let-titre="titre" let-icone="icone" let-nom="nom" let-recharger="recharger">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            <mat-icon class="!text-base !w-4 !h-4">{{ icone }}</mat-icon>
            {{ titre }}
          </div>
          <div class="flex items-center gap-1">
            <button type="button" *ngIf="cible.objectUrl && !cible.chargement && !cible.erreur"
                    class="btn btn-ghost btn-sm text-[12px]" (click)="telecharger(cible, nom)"
                    [disabled]="telechargement === cible.label" title="Télécharger le PDF">
              <mat-icon class="!text-sm !w-4 !h-4">{{ telechargement === cible.label ? 'hourglass_top' : 'download' }}</mat-icon>
            </button>
            <button type="button" class="btn btn-ghost btn-sm text-[12px]" (click)="recharger()" title="Recharger">
              <mat-icon class="!text-sm !w-4 !h-4">refresh</mat-icon>
            </button>
          </div>
        </div>
        <div *ngIf="cible.chargement" class="flex items-center justify-center gap-2 py-6 text-text-secondary text-[13px]">
          <mat-spinner diameter="20"></mat-spinner> Chargement…
        </div>
        <div *ngIf="cible.erreur && !cible.chargement" class="flex flex-col items-center gap-2 py-6 text-text-secondary text-[13px] text-center">
          <mat-icon class="!text-3xl text-text-muted">broken_image</mat-icon>
          <span>Document indisponible.</span>
          <button type="button" class="btn btn-outline btn-sm" (click)="recharger()">
            <mat-icon>refresh</mat-icon> Réessayer
          </button>
        </div>
        <!-- Aperçu : le haut du document ; un clic l'ouvre en entier. -->
        <div *ngIf="!cible.chargement && !cible.erreur && cible.objectUrl"
             class="relative h-64 sm:h-80 rounded-lg border border-border bg-white overflow-hidden shadow-sm">
          <img [src]="cible.objectUrl" [alt]="titre" class="block w-full h-auto">
          <button type="button" (click)="agrandir(cible, titre, nom)"
                  class="absolute inset-0 w-full h-full flex items-end justify-end p-2 bg-transparent hover:bg-black/5 transition-colors cursor-zoom-in"
                  [attr.aria-label]="'Agrandir : ' + titre">
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-[11px] font-semibold">
              <mat-icon class="!text-sm !w-4 !h-4">zoom_out_map</mat-icon> Agrandir
            </span>
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Vue plein écran d'un document (au-dessus de la modale du dossier) -->
    <div *ngIf="pleinEcran" class="fixed inset-0 z-[1100] bg-black/80 flex flex-col p-3 sm:p-6" (click)="pleinEcran = null">
      <div class="flex items-center justify-between gap-2 mb-2 text-white" (click)="$event.stopPropagation()">
        <span class="font-semibold text-[14px] truncate">{{ pleinEcran.titre }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn btn-sm border-0 bg-white/15 text-white hover:bg-white/25"
                  (click)="telecharger(pleinEcran.cible, pleinEcran.nom)" [disabled]="telechargement === pleinEcran.cible.label">
            <mat-icon>{{ telechargement === pleinEcran.cible.label ? 'hourglass_top' : 'download' }}</mat-icon> Télécharger
          </button>
          <button type="button" class="btn btn-sm border-0 bg-white/15 text-white hover:bg-white/25" (click)="pleinEcran = null">
            <mat-icon>close</mat-icon> Fermer
          </button>
        </div>
      </div>
      <!-- Document en entier, défilable (zoom à deux doigts sur téléphone). -->
      <div class="flex-1 min-h-0 overflow-auto rounded-lg bg-white" (click)="$event.stopPropagation()">
        <img [src]="pleinEcran.cible.objectUrl" [alt]="pleinEcran.titre" class="block w-full max-w-[900px] h-auto mx-auto">
      </div>
    </div>
  `
})
export class DossierPatientContenuComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) facture!: FactureStructure;
  @Input({ required: true }) dossier!: DossierPatient;
  @Input() documents?: DocumentComplementaire[];
  @Input() feuilleSoins?: { id: string; numero: string };

  pieces: PieceAffichee[] = [];
  documentsAffiches: DocumentComplementaire[] = [];
  /** Téléchargement en cours : feuille de soins, ou PDF de la fiche / de l'attestation. */
  telechargement: 'feuille' | 'fiche' | 'attestation' | null = null;
  apercu: string | null = null;
  /** Document ouvert en plein écran (au-dessus de la modale du dossier). */
  pleinEcran: { titre: string; nom: string; cible: ApercuDocument } | null = null;

  fiche: ApercuDocument = { label: 'fiche', objectUrl: null, chargement: false, erreur: false };
  attestation: ApercuDocument = { label: 'attestation', objectUrl: null, chargement: false, erreur: false };

  /** Rechargements liés, passés au gabarit `sectionDocument` via le contexte du ngTemplateOutlet. */
  rechargerFiche = () => this.chargerFiche();
  rechargerAttestation = () => this.chargerAttestation();

  private dejaLu = '';

  constructor(
    private structureService: StructureService,
    private feuilleSoinsService: FeuilleSoinsService,
    private snackBar: MatSnackBar
  ) {}

  get aCarte(): boolean {
    return exigeCartePoste(this.facture.regime) && !this.dossier.lettreGarantieNumero;
  }

  ngOnChanges() {
    const { facture, dossier } = this;
    const cle = [facture.id, dossier.id, dossier.updatedAt, (dossier.pieces || []).join(','),
      (this.documents || []).length, (facture.documentsComplementaires || []).length].join('|');
    if (cle === this.dejaLu) return;
    this.dejaLu = cle;
    this.apercu = null;
    this.pleinEcran = null;

    if (this.aCarte) this.chargerFiche();
    this.chargerAttestation();

    this.pieces = (dossier.pieces || [])
      .filter(type => type !== 'PHOTO_ASSURE')
      .map(type => ({ type, libelle: LIBELLES_PIECES[type] || type, image: null, erreur: false }));
    this.pieces.forEach(piece => {
      this.structureService.getPiece(facture.id, dossier.id, piece.type).pipe(last()).subscribe({
        next: lue => piece.image = lue.image,
        error: () => piece.erreur = true
      });
    });
    const parMatricule = dossier.matricule
      ? (facture.documentsComplementaires || []).filter(d => d.patientMatricule === dossier.matricule && d.image)
      : [];
    const fournis = (this.documents || []).filter(d => d.image);
    this.documentsAffiches = [...fournis, ...parMatricule.filter(d => !fournis.includes(d))];
  }

  chargerFiche() {
    this.resetApercu(this.fiche);
    this.fiche.chargement = true;
    this.structureService.ficheAssureImage(this.facture.id, this.dossier.id).subscribe({
      next: blob => this.afficherDocument(blob, this.fiche),
      error: () => { this.fiche.chargement = false; this.fiche.erreur = true; }
    });
  }

  chargerAttestation() {
    this.resetApercu(this.attestation);
    this.attestation.chargement = true;
    this.structureService.attestationSoinsImage(this.facture.id, this.dossier.id).subscribe({
      next: blob => this.afficherDocument(blob, this.attestation),
      error: () => { this.attestation.chargement = false; this.attestation.erreur = true; }
    });
  }

  /** Expose l'image de l'aperçu (blob JPEG) en object URL, affichable par `<img>`. */
  private afficherDocument(blob: Blob, cible: ApercuDocument) {
    this.resetApercu(cible);
    try {
      cible.objectUrl = URL.createObjectURL(blob);
    } catch {
      cible.erreur = true;
    }
    cible.chargement = false;
  }

  private resetApercu(cible: ApercuDocument) {
    if (this.pleinEcran?.cible === cible) this.pleinEcran = null;
    if (cible.objectUrl) URL.revokeObjectURL(cible.objectUrl);
    cible.objectUrl = null;
    cible.erreur = false;
  }

  /** Ouvre le document en entier, en plein écran. */
  agrandir(cible: ApercuDocument, titre: string, nom: string) {
    if (!cible.objectUrl) return;
    this.pleinEcran = { titre, nom, cible };
  }

  /** Télécharge le PDF du document (l'aperçu n'est qu'une image) — demande le réseau. */
  telecharger(cible: ApercuDocument, nom: string) {
    if (this.telechargement) return;
    this.telechargement = cible.label;
    const pdf$ = cible.label === 'fiche'
      ? this.structureService.ficheAssurePdf(this.facture.id, this.dossier.id)
      : this.structureService.attestationSoinsPdf(this.facture.id, this.dossier.id);
    pdf$.subscribe({
      next: blob => { this.telechargement = null; telecharger(blob, nom); },
      error: err => this.echec(err)
    });
  }

  imprimerFeuille(id: string, numero: string) {
    this.telechargement = 'feuille';
    this.feuilleSoinsService.exportPdf(id).subscribe({
      next: blob => { this.telechargement = null; ouvrirPdf(blob, `feuille_soins_${numero}.pdf`); },
      error: err => this.echec(err)
    });
  }

  ngOnDestroy() {
    // Libérer les object URLs des aperçus pour éviter les fuites mémoire.
    this.resetApercu(this.fiche);
    this.resetApercu(this.attestation);
  }

  private echec(err: any) {
    this.telechargement = null;
    this.snackBar.open(err?.error?.message || 'Document indisponible.', 'Fermer', { duration: 4000 });
  }
}

