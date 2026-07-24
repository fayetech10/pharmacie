/**
 * Normalise un numéro sénégalais en format international sans « + » (2217XXXXXXXX) :
 * accepte « 77 762 63 29 », « 00221777626329 », « +221 77 762 63 29 », « 0777626329 »…
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  // Préfixe international saisi avec « 00 » (ex: 00221...)
  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }
  if (digits.startsWith('221')) {
    return digits;
  }
  // Numéro local : retirer les zéros de tête puis ajouter l'indicatif Sénégal.
  return `221${digits.replace(/^0+/, '')}`;
}

/** Construit un lien wa.me à partir d'un numéro sénégalais local (ex: 77 762 63 29) et d'un message. */
export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}

export async function sharePdfOnWhatsApp(phone: string, message: string, blob: Blob, fileName: string): Promise<boolean> {
  const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });

  // Nous ignorons navigator.share car il empêche de pré-remplir le numéro de
  // téléphone du patient (obligeant l'utilisateur à enregistrer le contact).
  // À la place, on télécharge le fichier et on ouvre directement wa.me/numero.

  const url = window.URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  // window.open AVANT toute navigation : certains navigateurs mobiles bloquent
  // les popups différées ; le lien wa.me est ouvert dans un nouvel onglet.
  window.open(buildWhatsAppLink(phone, `${message}\n\nVeuillez joindre le fichier PDF téléchargé : ${fileName}`), '_blank');
  return false;
}
