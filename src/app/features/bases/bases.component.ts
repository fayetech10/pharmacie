import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BaseService } from '../../core/services/base.service';
import { BaseTraite, BaseImmatricule, BaseImportResult } from '../../core/models/base.model';

interface ColonneTraite { key: keyof BaseTraite; label: string; image?: boolean; }
interface ColonneImmat { key: keyof BaseImmatricule; label: string; image?: boolean; }

/**
 * Page « Bases » réservée au service régional de Thiès : import Excel, consultation
 * et impression de la base traité et de la base immatriculé & imprimé.
 */
@Component({
  selector: 'app-bases',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './bases.component.html',
  styleUrls: ['./bases.component.css']
})
export class BasesComponent implements OnInit {

  readonly traiteColumns: ColonneTraite[] = [
    { key: 'region', label: 'Region' },
    { key: 'departement', label: 'Departement' },
    { key: 'commune', label: 'Commune' },
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prenom' },
    { key: 'dateNaissance', label: 'Date Naissance' },
    { key: 'lieuNaissance', label: 'Lieu Naissance' },
    { key: 'sexe', label: 'Sexe' },
    { key: 'telephone', label: 'Telephone' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'cniExtrait', label: 'CNI/Extrait' },
    { key: 'assureur', label: 'Assureur' },
    { key: 'regime', label: 'Regime' },
    { key: 'typeAdhesion', label: 'Type Adhesion' },
    { key: 'typeBeneficiaire', label: 'Type Beneficiaire' },
    { key: 'typeCotisation', label: 'Type Cotisation' },
    { key: 'dateCotisation', label: 'Date Cotisation' },
    { key: 'photo', label: 'Photo', image: true },
    { key: 'indexExcel', label: 'Index' }
  ];

  readonly immatriculeColumns: ColonneImmat[] = [
    { key: 'externalId', label: 'ID' },
    { key: 'dateEnregistrement', label: 'Date Enregistrement' },
    { key: 'codeImmatriculation', label: 'Code Immatriculation' },
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prénom' },
    { key: 'dateNaissance', label: 'Date Naissance' },
    { key: 'sexe', label: 'Sexe' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'regime', label: 'Régime' },
    { key: 'assureur', label: 'Assureur' },
    { key: 'typeBeneficiaire', label: 'Type Bénéficiaire' },
    { key: 'dateCotisation', label: 'Date Cotisation' },
    { key: 'dateFinCotisation', label: 'Date Fin Cotisation' },
    { key: 'qrCodeUrl', label: 'QR Code', image: true },
    { key: 'region', label: 'Region' },
    { key: 'departement', label: 'Departement' },
    { key: 'commune', label: 'Commune' },
    { key: 'groupe', label: 'Groupe' },
    { key: 'typeAdhesion', label: 'Type Adhesion' },
    { key: 'typeCotisation', label: 'Type Cotisation' },
    { key: 'cni', label: 'CNI' },
    { key: 'photo', label: 'Photo', image: true }
  ];

  traite: BaseTraite[] = [];
  immatricule: BaseImmatricule[] = [];

  loadingTraite = false;
  loadingImmat = false;
  importingTraite = false;
  importingImmat = false;
  resultTraite: BaseImportResult | null = null;
  resultImmat: BaseImportResult | null = null;

  constructor(private baseService: BaseService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.loadTraite();
    this.loadImmatricule();
  }

  // ----- Chargement -----
  loadTraite(): void {
    this.loadingTraite = true;
    this.baseService.getTraite().subscribe({
      next: d => { this.traite = d || []; this.loadingTraite = false; },
      error: () => { this.loadingTraite = false; }
    });
  }

  loadImmatricule(): void {
    this.loadingImmat = true;
    this.baseService.getImmatricule().subscribe({
      next: d => { this.immatricule = d || []; this.loadingImmat = false; },
      error: () => { this.loadingImmat = false; }
    });
  }

  // ----- Import -----
  onImportTraite(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importingTraite = true;
    this.resultTraite = null;
    this.baseService.importTraite(file).subscribe({
      next: res => {
        this.importingTraite = false;
        this.resultTraite = res;
        this.snackBar.open(this.messageImport(res), 'Fermer', { duration: 5000 });
        this.loadTraite();
        input.value = '';
      },
      error: err => {
        this.importingTraite = false;
        this.snackBar.open(this.messageErreur(err), 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
        input.value = '';
      }
    });
  }

  onImportImmatricule(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importingImmat = true;
    this.resultImmat = null;
    this.baseService.importImmatricule(file).subscribe({
      next: res => {
        this.importingImmat = false;
        this.resultImmat = res;
        this.snackBar.open(this.messageImport(res), 'Fermer', { duration: 5000 });
        this.loadImmatricule();
        input.value = '';
      },
      error: err => {
        this.importingImmat = false;
        this.snackBar.open(this.messageErreur(err), 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
        input.value = '';
      }
    });
  }

  private messageImport(res: BaseImportResult): string {
    const parts = [`${res.importes} importée(s)`];
    if (res.doublons > 0) parts.push(`${res.doublons} doublon(s) ignoré(s)`);
    if (res.echecs > 0) parts.push(`${res.echecs} échec(s)`);
    return parts.join(', ');
  }

  private messageErreur(err: any): string {
    if (err?.error?.message) return err.error.message;
    if (err?.status === 403) return 'Accès refusé : fonctionnalité réservée au service régional de Thiès.';
    if (err?.status === 0) return 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
    return "Erreur lors de l'import.";
  }

  // ----- Modèles -----
  downloadTemplateTraite(): void {
    this.baseService.downloadTemplateTraite().subscribe({
      next: blob => this.telecharger(blob, 'modele_base_traite.xlsx'),
      error: () => this.snackBar.open('Impossible de télécharger le modèle.', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' })
    });
  }

  downloadTemplateImmatricule(): void {
    this.baseService.downloadTemplateImmatricule().subscribe({
      next: blob => this.telecharger(blob, 'modele_base_immatricule.xlsx'),
      error: () => this.snackBar.open('Impossible de télécharger le modèle.', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' })
    });
  }

  private telecharger(blob: Blob, nom: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ----- Affichage -----
  /** Vrai si la valeur est affichable en image (URL http(s) ou data URL d'image). */
  isImage(value: string | null | undefined): boolean {
    return !!value && /^(https?:\/\/|data:image\/)/i.test(value);
  }

  // ----- Impression -----
  imprimerTraite(): void {
    this.imprimer('Base traité', this.traiteColumns, this.traite);
  }

  imprimerImmatricule(): void {
    this.imprimer('Base immatriculé & imprimé', this.immatriculeColumns, this.immatricule);
  }

  private imprimer(titre: string, colonnes: { key: string; label: string; image?: boolean }[], lignes: any[]): void {
    if (!lignes.length) return;
    const thead = colonnes.map(c => `<th>${this.echapper(c.label)}</th>`).join('');
    const tbody = lignes.map(row => '<tr>' + colonnes.map(c => {
      const v = row[c.key] ?? '';
      if (c.image && this.isImage(v)) {
        return `<td><img src="${this.echapper(String(v))}" alt=""></td>`;
      }
      return `<td>${this.echapper(String(v))}</td>`;
    }).join('') + '</tr>').join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
      <title>${this.echapper(titre)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; color: #1b1b1b; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; vertical-align: top; }
        th { background: #eee; }
        img { max-width: 48px; max-height: 48px; object-fit: contain; }
        @page { size: landscape; margin: 8mm; }
      </style></head>
      <body>
        <h1>${this.echapper(titre)} — Service régional de Thiès</h1>
        <div class="meta">${lignes.length} enregistrement(s) — imprimé le ${new Date().toLocaleString('fr-FR')}</div>
        <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      this.snackBar.open("Veuillez autoriser les fenêtres pop-up pour imprimer.", 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // Laisse le temps aux images de se charger avant d'ouvrir la boîte d'impression.
    setTimeout(() => { try { w.print(); } catch { /* ignoré */ } }, 400);
  }

  /** Échappe le HTML pour éviter toute injection dans la fenêtre d'impression. */
  private echapper(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
