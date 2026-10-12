import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Facture, LigneFacture, StatutLigne } from '../../../core/models/facture.model';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { LigneMedicament, PIECES_PHARMACIE, PatientPharmacie, nombrePieces, patientsFacturePharmacie } from '../facture-patients';

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/**
 * Détail d'un patient d'une facture de pharmacie (« facture → patient ») : son identité, ses
 * médicaments et leurs montants (50 % SEN-CSU, 50 % bénéficiaire), les pièces de son dossier.
 * Même gabarit que le détail patient des points de soins. Le pharmacien y corrige ou
 * supprime un médicament tant que la facture n'est pas partie (ou après un rejet).
 */
@Component({
  selector: 'app-facture-patient-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule, StatusBadgeComponent],
  templateUrl: './facture-patient-detail.component.html'
})
export class FacturePatientDetailComponent implements OnInit {
  readonly pieces = PIECES_PHARMACIE;
  readonly nombrePieces = nombrePieces;
  readonly StatutLigne = StatutLigne;
  readonly Math = Math;

  facture: Facture | null = null;
  patients: PatientPharmacie[] = [];
  patient: PatientPharmacie | null = null;
  chargement = true;
  occupe = false;

  /** Pièce affichée en grand, et son agrandissement. */
  apercu: string | null = null;
  zoom = 1;

  private factureId = '';
  private clePatient = '';
  /** Ouvert depuis la liste de la facture : « Retour » y revient par l'historique. */
  private depuisFacture = false;
  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private factureService: FactureService,
    public authService: AuthService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar
  ) {
    this.depuisFacture = !!(this.router.getCurrentNavigation()?.extras.state?.['depuisFacture'] ?? history.state?.depuisFacture);
  }

  ngOnInit() {
    // Passer au patient suivant garde le même écran : on suit les paramètres.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('id') || '';
      this.clePatient = params.get('patient') || '';
      this.apercu = null;
      if (id !== this.factureId || !this.facture) {
        this.factureId = id;
        this.charger();
      } else {
        this.construire();
      }
      window.scrollTo({ top: 0 });
    });
  }

  private charger() {
    this.chargement = !this.facture;
    this.factureService.getById(this.factureId).subscribe({
      next: f => { this.appliquer(f); this.chargement = false; },
      error: err => {
        this.chargement = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  private appliquer(f: Facture) {
    this.facture = f;
    this.construire();
  }

  private construire() {
    this.patients = patientsFacturePharmacie(this.facture);
    this.patient = this.patients.find(p => p.cle === this.clePatient) || null;
  }

  // ─────────────── état dérivé ───────────────

  /** Le pharmacien corrige ses lignes tant que la facture n'est pas partie (ou après un rejet du SR). */
  get peutCorriger(): boolean {
    const s = this.facture?.statut;
    return this.authService.isPharmacien() && (s === 'BROUILLON' || s === 'REJETEE_SR');
  }

  get periode(): string {
    return this.facture ? `${MOIS[this.facture.mois] || ''} ${this.facture.annee}` : '';
  }

  get position(): number {
    return this.patient ? this.patients.indexOf(this.patient) + 1 : 0;
  }

  get precedent(): PatientPharmacie | null {
    return this.position > 1 ? this.patients[this.position - 2] : null;
  }

  get suivant(): PatientPharmacie | null {
    return this.position && this.position < this.patients.length ? this.patients[this.position] : null;
  }

  get nombreRejetees(): number {
    return (this.patient?.lignes || []).filter(l => l.ligne.statutLigne === StatutLigne.REJETEE).length;
  }

  // ─────────────── navigation ───────────────

  allerA(p: PatientPharmacie | null) {
    if (!p) return;
    this.router.navigate(['/dashboard/factures', this.factureId, 'patients', p.cle],
      { replaceUrl: true, state: { depuisFacture: this.depuisFacture } });
  }

  retour() {
    if (this.depuisFacture) {
      this.location.back();
      return;
    }
    this.router.navigate(['/dashboard/factures', this.factureId]);
  }

  ouvrirApercu(image: string) {
    this.apercu = image;
    this.zoom = 1;
  }

  fermerApercu() {
    this.apercu = null;
    this.zoom = 1;
  }

  // ─────────────── corrections du pharmacien ───────────────

  /** Modifie la quantité puis le prix unitaire d'une ligne, et enregistre la facture. */
  modifierLigne(item: LigneMedicament) {
    if (!this.peutCorriger) return;
    this.confirm.prompt({
      title: `Modifier « ${item.ligne.medicament} »`,
      label: 'Quantité',
      initialValue: String(item.ligne.quantite ?? 1),
      required: true,
      confirmText: 'Suivant'
    }).pipe(
      switchMap(qte => {
        if (qte === null) return of(null);
        const quantite = Number(qte);
        if (!Number.isFinite(quantite) || quantite <= 0) {
          this.snackBar.open('Quantité invalide', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
          return of(null);
        }
        return this.confirm.prompt({
          title: `Modifier « ${item.ligne.medicament} »`,
          label: 'Prix unitaire (FCFA)',
          initialValue: String(item.ligne.prixUnitaire ?? 0),
          required: true,
          confirmText: 'Enregistrer'
        }).pipe(map(prix => prix === null ? null : { quantite, prix: Number(prix) }));
      })
    ).subscribe(res => {
      if (!res) return;
      if (!Number.isFinite(res.prix) || res.prix < 0) {
        this.snackBar.open('Prix unitaire invalide', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
        return;
      }
      const lignes = [...(this.facture!.lignes || [])];
      lignes[item.index] = { ...lignes[item.index], quantite: res.quantite, prixUnitaire: res.prix, montant: res.quantite * res.prix };
      this.enregistrer(lignes, 'Ligne modifiée');
    });
  }

  supprimerLigne(item: LigneMedicament) {
    if (!this.peutCorriger) return;
    this.confirm.ask({
      title: 'Supprimer cette ligne',
      message: `Retirer « ${item.ligne.medicament} » de la facture ?`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.enregistrer((this.facture!.lignes || []).filter((_, i) => i !== item.index), 'Ligne supprimée');
    });
  }

  private enregistrer(lignes: LigneFacture[], message: string) {
    const f = this.facture!;
    this.occupe = true;
    this.factureService.update(f.id!, { mois: f.mois, annee: f.annee, lignes } as any).subscribe({
      next: maj => {
        this.occupe = false;
        this.appliquer(maj);
        this.snackBar.open(message, 'Fermer', { duration: 2500 });
      },
      error: err => {
        this.occupe = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
