/**
 * Teintes des pastilles d'icône (tuiles d'accueil, indicateurs) : une palette commune
 * pour que chaque espace ressemble à celui du poste de santé. Les classes sont écrites
 * en entier ici, pour que Tailwind les génère.
 */
export type Teinte = 'primary' | 'blue' | 'purple' | 'amber' | 'slate' | 'emerald' | 'rose' | 'indigo' | 'teal';

export const TEINTES: Record<Teinte, { pastille: string; survol: string }> = {
  primary: { pastille: 'bg-primary-light text-primary', survol: 'hover:border-primary' },
  blue: { pastille: 'bg-blue-50 text-blue-700', survol: 'hover:border-blue-400' },
  purple: { pastille: 'bg-purple-100 text-purple-700', survol: 'hover:border-purple-400' },
  amber: { pastille: 'bg-amber-50 text-amber-700', survol: 'hover:border-amber-400' },
  slate: { pastille: 'bg-slate-100 text-slate-700', survol: 'hover:border-slate-400' },
  emerald: { pastille: 'bg-emerald-50 text-emerald-700', survol: 'hover:border-emerald-400' },
  rose: { pastille: 'bg-rose-50 text-rose-700', survol: 'hover:border-rose-400' },
  indigo: { pastille: 'bg-indigo-50 text-indigo-700', survol: 'hover:border-indigo-400' },
  teal: { pastille: 'bg-teal-50 text-teal-700', survol: 'hover:border-teal-400' }
};
