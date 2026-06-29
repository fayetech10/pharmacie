import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { BaseService } from '../../core/services/base.service';
import { BaseTraite, BaseImmatricule, BaseImportResult } from '../../core/models/base.model';

interface Colonne { key: string; label: string; image?: boolean; }

/** Statistiques agrégées d'une base (calculées une fois par chargement). */
interface BaseStats {
  total: number;
  femmes: number; hommes: number; autres: number;
  pctFemmes: number; pctHommes: number;
  ageMoyen: number | null;
  nbDepartements: number; nbCommunes: number;
  sexeChart: ChartConfiguration<'doughnut'>['data'];
  ageChart: ChartConfiguration<'bar'>['data'];
  deptChart: ChartConfiguration<'bar'>['data'];
  communeChart: ChartConfiguration<'bar'>['data'];
  regimeChart: ChartConfiguration<'doughnut'>['data'];
}

type TabKey = 'traite' | 'immat';

/**
 * « Gestion des adhérents » (service régional de Thiès) : import Excel, tableau de
 * bord statistique (sexe, âge, département, commune, régime) et tableau paginé avec
 * recherche/impression, pour la base traité et la base immatriculé & imprimé.
 */
@Component({
  selector: 'app-bases',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, BaseChartDirective],
  templateUrl: './bases.component.html',
  styleUrls: ['./bases.component.css']
})
export class BasesComponent implements OnInit {

  /** Palette verte du thème + accents, réutilisée pour les graphiques. */
  private readonly palette = ['#2F6E54', '#4F9E78', '#8FCBB4', '#1F5038', '#A7D7C5', '#6BAF8E', '#357159', '#C3E3D5'];

  readonly traiteColumns: Colonne[] = [
    { key: 'region', label: 'Region' }, { key: 'departement', label: 'Departement' }, { key: 'commune', label: 'Commune' },
    { key: 'nom', label: 'Nom' }, { key: 'prenom', label: 'Prenom' }, { key: 'dateNaissance', label: 'Date Naissance' },
    { key: 'lieuNaissance', label: 'Lieu Naissance' }, { key: 'sexe', label: 'Sexe' }, { key: 'telephone', label: 'Telephone' },
    { key: 'adresse', label: 'Adresse' }, { key: 'cniExtrait', label: 'CNI/Extrait' }, { key: 'assureur', label: 'Assureur' },
    { key: 'regime', label: 'Regime' }, { key: 'typeAdhesion', label: 'Type Adhesion' }, { key: 'typeBeneficiaire', label: 'Type Beneficiaire' },
    { key: 'typeCotisation', label: 'Type Cotisation' }, { key: 'dateCotisation', label: 'Date Cotisation' },
    { key: 'photo', label: 'Photo', image: true }, { key: 'indexExcel', label: 'Index' }
  ];

  readonly immatriculeColumns: Colonne[] = [
    { key: 'externalId', label: 'ID' }, { key: 'dateEnregistrement', label: 'Date Enregistrement' }, { key: 'codeImmatriculation', label: 'Code Immatriculation' },
    { key: 'nom', label: 'Nom' }, { key: 'prenom', label: 'Prénom' }, { key: 'dateNaissance', label: 'Date Naissance' },
    { key: 'sexe', label: 'Sexe' }, { key: 'telephone', label: 'Téléphone' }, { key: 'adresse', label: 'Adresse' },
    { key: 'regime', label: 'Régime' }, { key: 'assureur', label: 'Assureur' }, { key: 'typeBeneficiaire', label: 'Type Bénéficiaire' },
    { key: 'dateCotisation', label: 'Date Cotisation' }, { key: 'dateFinCotisation', label: 'Date Fin Cotisation' },
    { key: 'qrCodeUrl', label: 'QR Code', image: true }, { key: 'region', label: 'Region' }, { key: 'departement', label: 'Departement' },
    { key: 'commune', label: 'Commune' }, { key: 'groupe', label: 'Groupe' }, { key: 'typeAdhesion', label: 'Type Adhesion' },
    { key: 'typeCotisation', label: 'Type Cotisation' }, { key: 'cni', label: 'CNI' }, { key: 'photo', label: 'Photo', image: true }
  ];

  // ----- Options de graphiques (partagées) -----
  readonly doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false, cutout: '58%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
  };
  readonly barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };
  readonly hBarOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  traite: BaseTraite[] = [];
  immatricule: BaseImmatricule[] = [];
  statsTraite: BaseStats | null = null;
  statsImmat: BaseStats | null = null;

  activeTab: TabKey = 'traite';
  search = '';
  page = 0;
  pageSize = 10;
  readonly pageSizes = [10, 25, 50, 100];

  loadingTraite = false;
  loadingImmat = false;
  importing = false;
  resultTraite: BaseImportResult | null = null;
  resultImmat: BaseImportResult | null = null;

  constructor(private baseService: BaseService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.loadTraite();
    this.loadImmatricule();
  }

  // ----- Onglets -----
  setTab(tab: TabKey): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.search = '';
    this.page = 0;
  }

  // ----- Accesseurs sur l'onglet courant -----
  get currentColumns(): Colonne[] {
    return this.activeTab === 'traite' ? this.traiteColumns : this.immatriculeColumns;
  }
  get currentRows(): any[] {
    return this.activeTab === 'traite' ? this.traite : this.immatricule;
  }
  get currentStats(): BaseStats | null {
    return this.activeTab === 'traite' ? this.statsTraite : this.statsImmat;
  }
  get currentLoading(): boolean {
    return this.activeTab === 'traite' ? this.loadingTraite : this.loadingImmat;
  }
  get currentResult(): BaseImportResult | null {
    return this.activeTab === 'traite' ? this.resultTraite : this.resultImmat;
  }

  get filteredRows(): any[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.currentRows;
    const cols = this.currentColumns;
    return this.currentRows.filter(r => cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
  }
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }
  get pagedRows(): any[] {
    const start = this.page * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }
  get rangeStart(): number {
    return this.filteredRows.length === 0 ? 0 : this.page * this.pageSize + 1;
  }
  get rangeEnd(): number {
    return Math.min((this.page + 1) * this.pageSize, this.filteredRows.length);
  }

  onSearchChange(): void { this.page = 0; }
  onPageSizeChange(): void { this.page = 0; }
  prevPage(): void { if (this.page > 0) this.page--; }
  nextPage(): void { if (this.page < this.totalPages - 1) this.page++; }

  // ----- Chargement -----
  loadTraite(): void {
    this.loadingTraite = true;
    this.baseService.getTraite().subscribe({
      next: d => { this.traite = d || []; this.statsTraite = this.computeStats(this.traite); this.loadingTraite = false; if (this.activeTab === 'traite') this.page = 0; },
      error: () => { this.loadingTraite = false; }
    });
  }
  loadImmatricule(): void {
    this.loadingImmat = true;
    this.baseService.getImmatricule().subscribe({
      next: d => { this.immatricule = d || []; this.statsImmat = this.computeStats(this.immatricule); this.loadingImmat = false; if (this.activeTab === 'immat') this.page = 0; },
      error: () => { this.loadingImmat = false; }
    });
  }

  // ----- Import (dispatch selon l'onglet) -----
  onImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing = true;
    const isTraite = this.activeTab === 'traite';
    if (isTraite) this.resultTraite = null; else this.resultImmat = null;
    const obs = isTraite ? this.baseService.importTraite(file) : this.baseService.importImmatricule(file);
    obs.subscribe({
      next: res => {
        this.importing = false;
        if (isTraite) this.resultTraite = res; else this.resultImmat = res;
        this.snackBar.open(this.messageImport(res), 'Fermer', { duration: 5000 });
        if (isTraite) this.loadTraite(); else this.loadImmatricule();
        input.value = '';
      },
      error: err => {
        this.importing = false;
        this.snackBar.open(this.messageErreur(err), 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
        input.value = '';
      }
    });
  }

  downloadTemplate(): void {
    const obs = this.activeTab === 'traite' ? this.baseService.downloadTemplateTraite() : this.baseService.downloadTemplateImmatricule();
    const nom = this.activeTab === 'traite' ? 'modele_base_traite.xlsx' : 'modele_base_immatricule.xlsx';
    obs.subscribe({
      next: blob => this.telecharger(blob, nom),
      error: () => this.snackBar.open('Impossible de télécharger le modèle.', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' })
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

  private telecharger(blob: Blob, nom: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom; a.click();
    window.URL.revokeObjectURL(url);
  }

  // ----- Statistiques -----
  private computeStats(rows: any[]): BaseStats {
    let f = 0, m = 0, a = 0;
    for (const r of rows) {
      const s = this.normSexe(r.sexe);
      if (s === 'F') f++; else if (s === 'M') m++; else a++;
    }
    const ages = rows.map(r => this.parseAge(r.dateNaissance)).filter((x): x is number => x !== null);
    const ageMoyen = ages.length ? Math.round(ages.reduce((s, x) => s + x, 0) / ages.length) : null;

    const buckets = [
      { l: '0-17', min: 0, max: 17 }, { l: '18-25', min: 18, max: 25 }, { l: '26-35', min: 26, max: 35 },
      { l: '36-45', min: 36, max: 45 }, { l: '46-60', min: 46, max: 60 }, { l: '61+', min: 61, max: 200 }
    ];
    const ageCounts = buckets.map(b => ages.filter(x => x >= b.min && x <= b.max).length);

    const deptMap = this.countBy(rows, r => r.departement);
    const communeMap = this.countBy(rows, r => r.commune);
    const regimeMap = this.countBy(rows, r => r.regime);
    const dept = this.topN(deptMap, 8);
    const commune = this.topN(communeMap, 8);
    const regime = this.topN(regimeMap, 6);

    const total = rows.length;
    return {
      total, femmes: f, hommes: m, autres: a,
      pctFemmes: total ? Math.round(f / total * 100) : 0,
      pctHommes: total ? Math.round(m / total * 100) : 0,
      ageMoyen, nbDepartements: deptMap.size, nbCommunes: communeMap.size,
      sexeChart: { labels: ['Femmes', 'Hommes', 'Autre/NR'], datasets: [{ data: [f, m, a], backgroundColor: ['#E08AAE', '#2F6E54', '#C3CBD3'] }] },
      ageChart: { labels: buckets.map(b => b.l), datasets: [{ data: ageCounts, backgroundColor: '#4F9E78' }] },
      deptChart: { labels: dept.labels, datasets: [{ data: dept.data, backgroundColor: '#2F6E54' }] },
      communeChart: { labels: commune.labels, datasets: [{ data: commune.data, backgroundColor: '#357159' }] },
      regimeChart: { labels: regime.labels, datasets: [{ data: regime.data, backgroundColor: this.palette }] }
    };
  }

  private normSexe(s: any): 'F' | 'M' | 'A' {
    const v = String(s ?? '').trim().toLowerCase();
    if (!v) return 'A';
    if (v.startsWith('f')) return 'F';
    if (v.startsWith('h') || v.startsWith('m')) return 'M';
    return 'A';
  }

  /** Calcule l'âge (en années) à partir d'une date de naissance en texte. Best-effort, null si illisible. */
  private parseAge(d: any): number | null {
    const str = String(d ?? '').trim();
    if (!str) return null;
    const now = new Date();
    let full: Date | null = null;
    const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
      full = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    } else {
      const dt = new Date(str);
      if (!isNaN(dt.getTime())) full = dt;
    }
    if (full && !isNaN(full.getTime())) {
      let age = now.getFullYear() - full.getFullYear();
      const mo = now.getMonth() - full.getMonth();
      if (mo < 0 || (mo === 0 && now.getDate() < full.getDate())) age--;
      return age >= 0 && age <= 120 ? age : null;
    }
    const ym = str.match(/\b(19\d{2}|20\d{2})\b/);
    if (ym) {
      const age = now.getFullYear() - +ym[1];
      if (age >= 0 && age <= 120) return age;
    }
    return null;
  }

  private countBy(rows: any[], keyFn: (r: any) => any): Map<string, number> {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = String(keyFn(r) ?? '').trim();
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  private topN(map: Map<string, number>, n: number): { labels: string[]; data: number[] } {
    const sorted = Array.from(map.entries()).sort((x, y) => y[1] - x[1]).slice(0, n);
    return { labels: sorted.map(e => e[0]), data: sorted.map(e => e[1]) };
  }

  // ----- Affichage / impression -----
  isImage(value: any): boolean {
    return !!value && /^(https?:\/\/|data:image\/)/i.test(String(value));
  }

  imprimer(): void {
    const titre = this.activeTab === 'traite' ? 'Base traité' : 'Base immatriculé & imprimé';
    const colonnes = this.currentColumns;
    const lignes = this.filteredRows;
    if (!lignes.length) return;

    const thead = colonnes.map(c => `<th>${this.echapper(c.label)}</th>`).join('');
    const tbody = lignes.map(row => '<tr>' + colonnes.map(c => {
      const v = row[c.key] ?? '';
      if (c.image && this.isImage(v)) return `<td><img src="${this.echapper(String(v))}" alt=""></td>`;
      return `<td>${this.echapper(String(v))}</td>`;
    }).join('') + '</tr>').join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${this.echapper(titre)}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:16px;color:#1b1b1b}
        h1{font-size:16px;margin:0 0 4px} .meta{font-size:11px;color:#555;margin-bottom:12px}
        table{border-collapse:collapse;width:100%;font-size:10px}
        th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}
        th{background:#eee} img{max-width:48px;max-height:48px;object-fit:contain}
        @page{size:landscape;margin:8mm}
      </style></head><body>
        <h1>${this.echapper(titre)} — Service régional de Thiès</h1>
        <div class="meta">${lignes.length} enregistrement(s) — imprimé le ${new Date().toLocaleString('fr-FR')}</div>
        <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { this.snackBar.open('Veuillez autoriser les fenêtres pop-up pour imprimer.', 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch { /* ignoré */ } }, 400);
  }

  private echapper(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
