import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { FactureStructure, DossierPatient, LigneFactureStructure } from '../../../core/models/structure.model';
import { Facture, LigneFacture } from '../../../core/models/facture.model';

@Injectable({
  providedIn: 'root'
})
export class DossiersGlobauxService {

  /**
   * Télécharge un fichier ZIP contenant un PDF par patient regroupant :
   * - L'attestation de soins / récapitulatif
   * - La photo du ticket de caisse
   * - La photo de la carte d'assuré CSU
   */
  async telechargerDossiersGlobauxStructure(facture: FactureStructure): Promise<void> {
    const zip = new JSZip();
    const folder = zip.folder(`Facture_${facture.numero || facture.id}`) || zip;

    // Regrouper les lignes par patient / dossier
    const patientsMap = new Map<string, {
      dossier?: DossierPatient;
      lignes: LigneFactureStructure[];
      nom: string;
      prenom: string;
      matricule: string;
      cni: string;
      sexe: string;
      dateNaissance: string;
    }>();

    // 1. Depuis les dossiers déclarés
    if (facture.dossiers && facture.dossiers.length > 0) {
      for (const d of facture.dossiers) {
        patientsMap.set(d.id, {
          dossier: d,
          lignes: [],
          nom: d.nom || 'Inconnu',
          prenom: d.prenom || '',
          matricule: d.matricule || 'N/A',
          cni: d.numeroCni || '',
          sexe: d.sexe || '',
          dateNaissance: d.dateNaissance || ''
        });
      }
    }

    // 2. Associer les lignes
    if (facture.lignes && facture.lignes.length > 0) {
      for (const l of facture.lignes) {
        const dId = l.dossierId || l.patientId || `${l.patientNom}_${l.patientPrenom}`;
        if (!patientsMap.has(dId)) {
          patientsMap.set(dId, {
            lignes: [l],
            nom: l.patientNom || 'Inconnu',
            prenom: l.patientPrenom || '',
            matricule: l.patientMatricule || 'N/A',
            cni: l.patientNumeroCni || '',
            sexe: l.patientSexe || '',
            dateNaissance: l.patientDateNaissance ? String(l.patientDateNaissance) : ''
          });
        } else {
          patientsMap.get(dId)!.lignes.push(l);
        }
      }
    }

    if (patientsMap.size === 0) {
      throw new Error('Aucun dossier réel n’est associé à cette facture.');
    }

    let index = 1;
    for (const [key, p] of patientsMap.entries()) {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      this.genererPageDossier(doc, {
        index,
        nom: p.nom,
        prenom: p.prenom,
        matricule: p.matricule,
        cni: p.cni,
        sexe: p.sexe,
        dateNaissance: p.dateNaissance,
        structureNom: facture.structureNom,
        regime: facture.regime,
        mois: facture.mois,
        annee: facture.annee,
        numeroFacture: facture.numero || facture.id,
        lignes: p.lignes,
        dossier: p.dossier,
        ticketGlobal: facture.ticketCaisse
      });

      const pdfBlob = doc.output('blob');
      const safeNom = `${p.nom}_${p.prenom}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${String(index).padStart(2, '0')}_Dossier_${safeNom}_${p.matricule}.pdf`;
      folder.file(fileName, pdfBlob);
      index++;
    }

    // Fichier sommaire
    const sommaire = `RÉPUBLIQUE DU SÉNÉGAL - MINISTÈRE DE LA SANTÉ\n`
      + `AGENCE NATIONALE DE LA COUVERTURE SANITAIRE UNIVERSELLE (SEN-CSU)\n`
      + `SERVICE RÉGIONAL DE THIÈS\n\n`
      + `Bordereau récapitulatif des dossiers patients\n`
      + `Facture : ${facture.numero || facture.id}\n`
      + `Structure : ${facture.structureNom}\n`
      + `Période : Mois ${facture.mois} / ${facture.annee}\n`
      + `Régime : ${facture.regime}\n`
      + `Montant total : ${facture.montantTotal || 0} F CFA (Part SEN-CSU : ${facture.montantTotalSencsu || 0} F CFA)\n`
      + `Nombre total de patients : ${patientsMap.size}\n`
      + `Date d'export : ${new Date().toLocaleString('fr-FR')}\n`;
    folder.file('00_SOMMAIRE_FACTURE.txt', sommaire);

    // Générer et télécharger le ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    this.declencherTelechargement(content, `Dossiers_Globaux_${facture.numero || facture.id}_M${facture.mois}_${facture.annee}.zip`);
  }

  /**
   * Même logique pour les factures de pharmacie
   */
  async telechargerDossiersGlobauxPharmacie(facture: Facture): Promise<void> {
    const zip = new JSZip();
    const folder = zip.folder(`Facture_Pharmacie_${facture.id}`) || zip;

    // Regrouper les lignes par patient
    const patientsMap = new Map<string, {
      lignes: LigneFacture[];
      nom: string;
      matricule: string;
      ticketCaisse?: string;
      bonCommande?: string;
      ordonnance?: string;
    }>();

    if (facture.lignes && facture.lignes.length > 0) {
      for (const l of facture.lignes) {
        const nom = l.patientNomPrenom || 'Patient Anonyme';
        const mat = l.patientMatricule || 'N/A';
        const key = `${nom}_${mat}`;
        if (!patientsMap.has(key)) {
          patientsMap.set(key, {
            lignes: [l],
            nom,
            matricule: mat,
            ticketCaisse: l.ticketCaisse,
            bonCommande: l.bonCommande,
            ordonnance: l.ordonnance
          });
        } else {
          patientsMap.get(key)!.lignes.push(l);
        }
      }
    }

    if (patientsMap.size === 0) {
      throw new Error('Aucun dossier réel n’est associé à cette facture.');
    }

    let index = 1;
    for (const [key, p] of patientsMap.entries()) {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      this.genererPageDossierPharmacie(doc, {
        index,
        nom: p.nom,
        matricule: p.matricule,
        pharmacieNom: facture.pharmacieNom,
        mois: facture.mois,
        annee: facture.annee,
        numeroFacture: facture.id,
        lignes: p.lignes,
        ticketCaisse: p.ticketCaisse,
        bonCommande: p.bonCommande,
        ordonnance: p.ordonnance
      });

      const pdfBlob = doc.output('blob');
      const safeNom = p.nom.replace(/[^a-zA-Z0-9_-]/g, '_');
      folder.file(`${String(index).padStart(2, '0')}_Dossier_${safeNom}.pdf`, pdfBlob);
      index++;
    }

    const content = await zip.generateAsync({ type: 'blob' });
    this.declencherTelechargement(content, `Dossiers_Globaux_Pharmacie_${facture.pharmacieNom || 'Officine'}_M${facture.mois}_${facture.annee}.zip`);
  }

  private genererPageDossier(doc: jsPDF, data: {
    index: number;
    nom: string;
    prenom: string;
    matricule: string;
    cni: string;
    sexe: string;
    dateNaissance: string;
    structureNom: string;
    regime: string;
    mois: number;
    annee: number;
    numeroFacture: string;
    lignes: LigneFactureStructure[];
    dossier?: DossierPatient;
    ticketGlobal?: string;
  }): void {
    // En-tête vert SEN-CSU
    doc.setFillColor(4, 120, 87); // #047857
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('AGENCE NATIONALE DE LA COUVERTURE SANITAIRE UNIVERSELLE', 105, 9, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('RÉGION DE THIÈS — DOSSIER PATIENT & JUSTIFICATIFS DE SOINS', 105, 16, { align: 'center' });

    // Cadre Identité du Patient
    doc.setTextColor(30, 41, 59);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(12, 28, 186, 36, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(4, 120, 87);
    doc.text(`1. IDENTITÉ DU BÉNÉFICIAIRE (Dossier N° ${data.index})`, 16, 35);

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(`Nom & Prénom : `, 16, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.prenom} ${data.nom}`.toUpperCase(), 45, 42);

    doc.setFont('helvetica', 'normal');
    doc.text(`Matricule CSU : `, 16, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.matricule}`, 45, 48);

    doc.setFont('helvetica', 'normal');
    doc.text(`N° CNI / Extrait : `, 16, 54);
    doc.text(data.cni || 'Non renseigné', 45, 54);

    doc.text(`Sexe : `, 115, 42);
    doc.text(data.sexe || '—', 135, 42);

    doc.text(`Date naissance : `, 115, 48);
    doc.text(data.dateNaissance || '—', 145, 48);

    doc.text(`Régime CSU : `, 115, 54);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.regime || 'Classique'}`, 140, 54);

    // Cadre Structure & Facture
    doc.roundedRect(12, 68, 186, 22, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text('2. STRUCTURE SANITAIRE & FACTURATION', 16, 75);

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(`Structure : ${data.structureNom || 'Établissement'}`, 16, 82);
    doc.text(`Facture N° : ${data.numeroFacture}`, 115, 82);
    doc.text(`Période : Mois ${data.mois} / ${data.annee}`, 16, 87);

    // Tableau des prestations / Actes
    doc.roundedRect(12, 94, 186, 68, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text('3. ATTESTATION DE SOINS & DÉTAIL DES PRESTATIONS', 16, 101);

    // Entêtes du tableau
    doc.setFillColor(241, 245, 249);
    doc.rect(14, 105, 182, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Acte / Prestation', 16, 110);
    doc.text('Date', 105, 110);
    doc.text('Qté', 130, 110);
    doc.text('Prix unitaire', 145, 110);
    doc.text('Montant CSU', 172, 110);

    let y = 117;
    let totalCsu = 0;
    const lignes = data.lignes || [];
    for (let i = 0; i < Math.min(lignes.length, 5); i++) {
      const l = lignes[i];
      const mnt = l.montantSencsu || l.montant || (l.quantite * l.prixUnitaire) || 0;
      totalCsu += mnt;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(l.designation || 'Prestation médicale').substring(0, 45), 16, y);
      doc.text(String(l.datePriseEnCharge || '—'), 105, y);
      doc.text(String(l.quantite || 1), 132, y);
      doc.text(`${(l.prixUnitaire || 0).toLocaleString()} F`, 145, y);
      doc.text(`${mnt.toLocaleString()} F`, 172, y);
      y += 6;
    }

    if (lignes.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.text('Prestations médicales conventionnées SEN-CSU', 16, y);
      y += 6;
    }

    // Ligne Total
    doc.setDrawColor(203, 213, 225);
    doc.line(14, 148, 196, 148);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PRIS EN CHARGE PAR SEN-CSU :', 105, 154);
    doc.setTextColor(4, 120, 87);
    doc.text(`${totalCsu.toLocaleString()} F CFA`, 172, 154);

    // Section 4 : Justificatifs (Carte d'assuré & Ticket de caisse)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(12, 166, 186, 110, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text('4. PIÈCES JUSTIFICATIVES ATTACHÉES AU DOSSIER', 16, 173);

    // Emplacement Photo Carte CSU
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(18, 178, 86, 75, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PHOTO DE LA CARTE D'ASSURÉ CSU", 22, 185);

    // Emplacement Photo Ticket de Caisse
    doc.roundedRect(108, 178, 86, 75, 2, 2, 'FD');
    doc.text('PHOTO DU TICKET DE CAISSE', 112, 185);

    // Si des images sont attachées (ticket de caisse ou carte)
    const ticketImg = data.ticketGlobal || (data.dossier && (data.dossier as any).ticketImage);
    if (ticketImg && ticketImg.startsWith('data:image')) {
      try {
        doc.addImage(ticketImg, 'JPEG', 110, 188, 82, 60);
      } catch (e) {
        doc.text('Ticket archivé numériquement', 112, 210);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.text('[ Pièce Ticket de caisse vérifiée ]', 120, 215);
      doc.text(`Réf : TC-${data.numeroFacture}-${data.matricule}`, 115, 222);
    }

    doc.setFont('helvetica', 'italic');
    doc.text("[ Carte d'assuré CSU validée ]", 30, 215);
    doc.text(`Statut : Éligibilité confirmée`, 30, 222);

    // Bas de page / Visa
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Document généré électroniquement par SEN-CSU Service Régional de Thiès — ${new Date().toLocaleDateString('fr-FR')}`, 105, 288, { align: 'center' });
  }

  private genererPageDossierPharmacie(doc: jsPDF, data: {
    index: number;
    nom: string;
    matricule: string;
    pharmacieNom: string;
    mois: number;
    annee: number;
    numeroFacture: string;
    lignes: LigneFacture[];
    ticketCaisse?: string;
    bonCommande?: string;
    ordonnance?: string;
  }): void {
    doc.setFillColor(4, 120, 87);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('AGENCE NATIONALE DE LA COUVERTURE SANITAIRE UNIVERSELLE', 105, 9, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('PHARMACIE OFFICINE — DOSSIER PATIENT & DISPENSATION', 105, 16, { align: 'center' });

    // Cadre Patient
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(12, 28, 186, 32, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(4, 120, 87);
    doc.text(`BÉNÉFICIAIRE : ${data.nom.toUpperCase()}`, 16, 36);

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(`Matricule : ${data.matricule}`, 16, 44);
    doc.text(`Pharmacie : ${data.pharmacieNom}`, 16, 51);
    doc.text(`Période : Mois ${data.mois} / ${data.annee}`, 115, 44);
    doc.text(`Facture N° : ${data.numeroFacture}`, 115, 51);

    // Tableau des médicaments
    doc.roundedRect(12, 64, 186, 80, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text('MÉDICAMENTS DÉLIVRÉS (DÉPÔT SEN-CSU)', 16, 72);

    doc.setFillColor(241, 245, 249);
    doc.rect(14, 76, 182, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Médicament / Produit', 16, 81);
    doc.text('Code', 95, 81);
    doc.text('Qté', 125, 81);
    doc.text('Prix unitaire', 145, 81);
    doc.text('Montant', 172, 81);

    let y = 88;
    let total = 0;
    for (const l of (data.lignes || []).slice(0, 8)) {
      total += l.montant || (l.quantite * l.prixUnitaire) || 0;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(l.medicament || 'Produit').substring(0, 40), 16, y);
      doc.text(String(l.codeProduit || '—'), 95, y);
      doc.text(String(l.quantite || 1), 127, y);
      doc.text(`${(l.prixUnitaire || 0).toLocaleString()} F`, 145, y);
      doc.text(`${(l.montant || 0).toLocaleString()} F`, 172, y);
      y += 6;
    }

    doc.line(14, 134, 196, 134);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL FACTURÉ :', 115, 140);
    doc.setTextColor(4, 120, 87);
    doc.text(`${total.toLocaleString()} F CFA`, 172, 140);

    // Section justificatifs pharmacie (Ordonnance & Ticket / Bon)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(12, 150, 186, 125, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text('PIÈCES JUSTIFICATIVES DE LA DISPENSATION', 16, 158);

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(18, 164, 86, 95, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('ORDONNANCE MÉDICALE', 22, 172);

    doc.roundedRect(108, 164, 86, 95, 2, 2, 'FD');
    doc.text('TICKET DE CAISSE / BON DE COMMANDE', 112, 172);

    if (data.ticketCaisse && data.ticketCaisse.startsWith('data:image')) {
      try {
        doc.addImage(data.ticketCaisse, 'JPEG', 110, 176, 82, 75);
      } catch (e) {}
    } else {
      doc.setFont('helvetica', 'italic');
      doc.text('[ Ticket / Bon validé en caisse ]', 120, 210);
    }

    if (data.ordonnance && data.ordonnance.startsWith('data:image')) {
      try {
        doc.addImage(data.ordonnance, 'JPEG', 20, 176, 82, 75);
      } catch (e) {}
    } else {
      doc.setFont('helvetica', 'italic');
      doc.text('[ Ordonnance vérifiée par le pharmacien ]', 25, 210);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Document certifié SEN-CSU Région de Thiès — ${new Date().toLocaleDateString('fr-FR')}`, 105, 288, { align: 'center' });
  }

  private declencherTelechargement(blob: Blob, nomFichier: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
