import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { last } from 'rxjs/operators';
import {
  DocumentComplementaire, DossierPatient, FactureStructure, LIBELLES_PIECES, TypePiece
} from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';
import { exigeCartePoste, ouvrirPdf } from '../poste-facturation';

interface PieceAffichee { type: TypePiece; libelle: string; image: string | null; erreur: boolean; }
/**
 * Un PDF affichÃ© dans la visionneuse native du navigateur via un blob URL (`<iframe>`). Pas de
 * worker ni de rendu canvas : robuste, sans dÃ©pendance, et fonctionne hors ligne (le blob vient
 * de la rÃ©ponse dÃ©jÃ  tÃ©lÃ©chargÃ©e). `objectUrl` est l'URL brute, Ã  rÃ©voquer pour libÃ©rer la mÃ©moire.
 */
interface ApercuDocument { label: string; url: SafeResourceUrl | null; objectUrl: string | null; chargement: boolean; erreur: boolean; }

/**
 * Contenu du Â« dossier patient Â» : la fiche assurÃ© et l'attestation de soins sont affichÃ©es dans
 * la visionneuse PDF native du navigateur (`<iframe>` sur un blob URL), sans worker ni rendu
 * canvas. Le ticket de caisse reste tÃ©lÃ©chargeable.
 */
@Component({
  selector: 'app-dossier-patient-contenu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <!-- AperÃ§u plein Ã©cran d'une piÃ¨ce jointe photo -->
    <div *ngIf="apercu">
      <button type="button" class="btn btn-ghost btn-sm mb-2" (click)="apercu = null">
        <mat-icon>arrow_back</mat-icon> Retour au dossier
      </button>
      <img [src]="apercu" alt="PiÃ¨ce justificative" class="block w-full rounded-lg border border-border bg-white">
    </div>

    <div *ngIf="!apercu" class="flex flex-col gap-4">

      <!-- Informations de l'assurÃ© (aperÃ§u cliquable) -->
      <ng-container *ngIf="aCarte" [ngTemplateOutlet]="sectionDocument" [ngTemplateOutletContext]="{
        $implicit: fiche, titre: 'Informations de l\\'assurÃ©', icone: 'badge',
        nom: 'fiche_assure.jpg', recharger: rechargerFiche }"></ng-container>

      <!-- Attestation de soins (aperÃ§u cliquable) -->
      <ng-container [ngTemplateOutlet]="sectionDocument" [ngTemplateOutletContext]="{
        $implicit: attestation, titre: 'Attestation de soins', icone: 'assignment',
        nom: 'attestation_soins.jpg', recharger: rechargerAttestation }"></ng-container>

      <!-- Ticket de caisse / Feuille de soins (PDF tÃ©lÃ©chargeable) -->
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

      <!-- PiÃ¨ces jointes (photos) -->
      <div *ngIf="pieces.length || documentsAffiches.length" class="flex flex-col gap-2">
        <div class="text-[12px] font-semibold uppercase tracking-wide text-text-muted pb-1 border-b border-border-light">
          PiÃ¨ces jointes
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

    <!-- Gabarit d'une section document : aperÃ§u cliquable (image du document) + tÃ©lÃ©charger -->
    <ng-template #sectionDocument let-cible let-titre="titre" let-icone="icone" let-nom="nom" let-recharger="recharger">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            <mat-icon class="!text-base !w-4 !h-4">{{ icone }}</mat-icon>
            {{ titre }}
          </div>
          <div class="flex items-center gap-1">
            <button type="button" *ngIf="cible.objectUrl && !cible.chargement && !cible.erreur"
                    class="btn btn-ghost btn-sm text-[12px]" (click)="telecharger(cible, nom)" title="TÃ©lÃ©charger">
              <mat-icon class="!text-sm !w-4 !h-4">download</mat-icon>
            </button>
            <button type="button" class="btn btn-ghost btn-sm text-[12px]" (click)="recharger()" title="Recharger">
              <mat-icon class="!text-sm !w-4 !h-4">refresh</mat-icon>
            </button>
          </div>
        </div>
        <div *ngIf="cible.chargement" class="flex items-center justify-center gap-2 py-6 text-text-secondary text-[13px]">
          <mat-spinner diameter="20"></mat-spinner> Chargementâ€¦
        </div>
        <div *ngIf="cible.erreur && !cible.chargement" class="flex flex-col items-center gap-2 py-6 text-text-secondary text-[13px] text-center">
          <mat-icon class="!text-3xl text-text-muted">broken_image</mat-icon>
          <span>Document indisponible.</span>
          <button type="button" class="btn btn-outline btn-sm" (click)="recharger()">
            <mat-icon>refresh</mat-icon> RÃ©essayer
          </button>
        </div>
        <div *ngIf="!cible.chargement && !cible.erreur && cible.url"
             class="relative rounded-lg border border-border bg-white overflow-hidden shadow-sm">
          <iframe [src]="cible.url" [title]="titre" tabindex="-1"
                  class="w-full h-64 sm:h-80 bg-white border-0 pointer-events-none"></iframe>
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

    <!-- Vue plein Ã©cran d'un document (au-dessus de la modale du dossier) -->
    <div *ngIf="pleinEcran" class="fixed inset-0 z-[1100] bg-black/80 flex flex-col p-3 sm:p-6" (click)="pleinEcran = null">
      <div class="flex items-center justify-between gap-2 mb-2 text-white" (click)="$event.stopPropagation()">
        <span class="font-semibold text-[14px] truncate">{{ pleinEcran.titre }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="btn btn-sm border-0 bg-white/15 text-white hover:bg-white/25"
                  (click)="telecharger(pleinEcran.cible, pleinEcran.nom)">
            <mat-icon>download</mat-icon> TÃ©lÃ©charger
          </button>
          <button type="button" class="btn btn-sm border-0 bg-white/15 text-white hover:bg-white/25" (click)="pleinEcran = null">
            <mat-icon>close</mat-icon> Fermer
          </button>
        </div>
      </div>
      <iframe [src]="pleinEcran.url" [title]="pleinEcran.titre"
              class="flex-1 w-full rounded-lg bg-white border-0" (click)="$event.stopPropagation()"></iframe>
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
  telechargement: 'feuille' | null = null;
  apercu: string | null = null;
  /** Document ouvert en plein Ã©cran (au-dessus de la modale du dossier). */
  pleinEcran: { url: SafeResourceUrl; titre: string; nom: string; cible: ApercuDocument } | null = null;

  fiche: ApercuDocument = { label: 'fiche', url: null, objectUrl: null, chargement: false, erreur: false };
  attestation: ApercuDocument = { label: 'attestation', url: null, objectUrl: null, chargement: false, erreur: false };

  /** Rechargements liÃ©s, passÃ©s au gabarit `sectionDocument` via le contexte du ngTemplateOutlet. */
  rechargerFiche = () => this.chargerFiche();
  rechargerAttestation = () => this.chargerAttestation();

  private dejaLu = '';

  constructor(
    private structureService: StructureService,
    private feuilleSoinsService: FeuilleSoinsService,
    private sanitizer: DomSanitizer,
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

  /**
   * Affiche le PDF dans la visionneuse native : on expose le blob via un object URL que le
   * navigateur sait rendre dans un `<iframe>`. `#toolbar=0&navpanes=0` masque la barre d'outils
   * du lecteur intÃ©grÃ© (ignorÃ© par les navigateurs qui ne la gÃ¨rent pas). Aucun worker requis.
   */
  private afficherDocument(blob: Blob, cible: ApercuDocument) {
    this.resetApercu(cible);
    try {
      const objectUrl = URL.createObjectURL(blob);
      cible.objectUrl = objectUrl;
      cible.url = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    } catch {
      cible.erreur = true;
    }
    cible.chargement = false;
  }

  private resetApercu(cible: ApercuDocument) {
    if (this.pleinEcran?.cible === cible) this.pleinEcran = null;
    if (cible.objectUrl) URL.revokeObjectURL(cible.objectUrl);
    cible.objectUrl = null;
    cible.url = null;
    cible.erreur = false;
  }

  /** Ouvre le document en plein Ã©cran â€” on garde la barre d'outils du lecteur (zoom, impression). */
  agrandir(cible: ApercuDocument, titre: string, nom: string) {
    if (!cible.objectUrl) return;
    this.pleinEcran = { url: this.sanitizer.bypassSecurityTrustResourceUrl(cible.objectUrl), titre, nom, cible };
  }

  /** TÃ©lÃ©charge le PDF dÃ©jÃ  en mÃ©moire (object URL), sans nouvel appel rÃ©seau. */
  telecharger(cible: ApercuDocument, nom: string) {
    if (!cible.objectUrl) return;
    const a = document.createElement('a');
    a.href = cible.objectUrl;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  imprimerFeuille(id: string, numero: string) {
    this.telechargement = 'feuille';
    this.feuilleSoinsService.exportPdf(id).subscribe({
      next: blob => { this.telechargement = null; ouvrirPdf(blob, `feuille_soins_${numero}.pdf`); },
      error: err => this.echec(err)
    });
  }

  ngOnDestroy() {
    // LibÃ©rer les object URLs des PDF pour Ã©viter les fuites mÃ©moire.
    this.resetApercu(this.fiche);
    this.resetApercu(this.attestation);
  }

  private echec(err: any) {
    this.telechargement = null;
    this.snackBar.open(err?.error?.message || 'Document indisponible.', 'Fermer', { duration: 4000 });
  }
}

