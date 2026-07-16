/** Construit un lien wa.me à partir d'un numéro sénégalais local (ex: 77 762 63 29) et d'un message. */
export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  // Préfixe indicatif Sénégal (221) si absent d'un numéro local.
  const withCountryCode = digits.startsWith('221') ? digits : `221${digits.replace(/^0+/, '')}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export async function sharePdfOnWhatsApp(phone: string, message: string, blob: Blob, fileName: string): Promise<boolean> {
  const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  const file = new File([pdf], fileName, { type: 'application/pdf' });
  const shareData: ShareData = {
    title: fileName,
    text: message,
    files: [file]
  };

  // Nous ignorons navigator.share car il empêche de pré-remplir le numéro de
  // téléphone du patient (obligeant l'utilisateur à enregistrer le contact).
  // À la place, on télécharge le fichier et on ouvre directement wa.me/numero.

  const url = window.URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  window.open(buildWhatsAppLink(phone, `${message}\n\nVeuillez joindre le fichier PDF telecharge : ${fileName}`), '_blank');
  return false;
}
