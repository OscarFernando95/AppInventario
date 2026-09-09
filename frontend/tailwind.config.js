/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        dark: {
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      // Escala de apilado con nombres. Evita la escalada de z-[9999] / z-[10000]:
      // si algo tiene que ir encima de un modal, es un `modal-top`, no un número mayor.
      zIndex: {
        dropdown: '20',
        sticky: '30',
        overlay: '40',
        modal: '50',
        'modal-top': '60',
        toast: '70',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        // Se usaba `animate-slide-in-right` en el drawer de Pedidos pero la
        // animación no estaba definida, así que la clase no hacía nada.
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      }
    },
  },
  plugins: [],
}
