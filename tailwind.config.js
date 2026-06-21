/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Reset/normalize déjà fourni par le reset maison (styles.css) + Angular Material.
  // On désactive le preflight de Tailwind pour éviter tout conflit visuel.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      // Les couleurs pointent sur les variables :root (styles.css) =
      // source de vérité unique du thème, apparence préservée à l'identique.
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          light: 'var(--primary-light)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          dark: 'var(--primary-dark)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          deep: 'var(--ink-deep)',
          soft: 'var(--ink-soft)',
          text: 'var(--ink-text)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--accent-light)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          light: 'var(--warn-light)',
        },
        success: {
          DEFAULT: 'var(--success)',
          light: 'var(--success-light)',
        },
        bg: 'var(--bg)',
        card: 'var(--card-bg)',
        field: 'var(--field-bg)',
        border: {
          DEFAULT: 'var(--border)',
          light: 'var(--border-light)',
        },
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      backgroundImage: {
        'ink-gradient': 'var(--ink-gradient)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
    screens: {
      // Mobile-first : base = mobile ; ces points alignent les breakpoints
      // déjà utilisés dans le projet (480 / 640 / 768 / 900 / 1024).
      xs: '480px',
      sm: '640px',
      md: '768px',
      mdx: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [],
};
