/**
 * Stockage durable sur l'appareil (IndexedDB) pour le mode hors ligne.
 *
 * IndexedDB et non localStorage : une saisie hors ligne transporte ses photos (CNI, extrait
 * de naissance), plusieurs centaines de Ko chacune — localStorage plafonne à 5 Mo et bloque
 * la page à chaque écriture. Deux magasins :
 *  - `saisies` : patients enregistrés hors ligne, en attente d'envoi ;
 *  - `cache`   : dernières données lues en ligne (catalogue des prestations…), relues hors ligne.
 */

const BASE = 'csu-hors-ligne';
const VERSION = 1;
export const MAGASIN_SAISIES = 'saisies';
const MAGASIN_CACHE = 'cache';

let ouverture: Promise<IDBDatabase> | null = null;

function base(): Promise<IDBDatabase> {
  ouverture ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Stockage de l\'appareil indisponible'));
      return;
    }
    const requete = indexedDB.open(BASE, VERSION);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(MAGASIN_SAISIES)) db.createObjectStore(MAGASIN_SAISIES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MAGASIN_CACHE)) db.createObjectStore(MAGASIN_CACHE);
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => {
      ouverture = null;
      reject(requete.error);
    };
  });
  return ouverture;
}

async function transaction<T>(magasin: string, mode: IDBTransactionMode,
                              action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await base();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(magasin, mode);
    const requete = action(tx.objectStore(magasin));
    tx.oncomplete = () => resolve(requete.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function listerTout<T>(magasin: string): Promise<T[]> {
  return transaction<T[]>(magasin, 'readonly', store => store.getAll() as IDBRequest<T[]>);
}

/** Élément du magasin sous cette clé, ou undefined s'il n'y est plus. */
export function lire<T>(magasin: string, cle: string): Promise<T | undefined> {
  return transaction<T | undefined>(magasin, 'readonly', store => store.get(cle) as IDBRequest<T | undefined>);
}

export function enregistrer<T>(magasin: string, valeur: T): Promise<unknown> {
  return transaction(magasin, 'readwrite', store => store.put(valeur));
}

export function supprimer(magasin: string, cle: string): Promise<unknown> {
  return transaction(magasin, 'readwrite', store => store.delete(cle));
}

/** Mémorise une donnée lue en ligne, pour la relire hors ligne. */
export function memoriser<T>(cle: string, valeur: T): Promise<unknown> {
  return transaction(MAGASIN_CACHE, 'readwrite', store => store.put({ valeur, le: Date.now() }, cle));
}

/** Dernière valeur mémorisée sous cette clé, ou null. */
export async function relire<T>(cle: string): Promise<T | null> {
  const entree = await transaction<{ valeur: T } | undefined>(MAGASIN_CACHE, 'readonly',
    store => store.get(cle) as IDBRequest<{ valeur: T } | undefined>);
  return entree ? entree.valeur : null;
}
