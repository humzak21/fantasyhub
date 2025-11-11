/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './types/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
    './*.{js,ts,jsx,tsx}',
  ],
  prefix: '',
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		screens: {
  			xs: '475px'
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// Fantasy Football Brand Colors
  			'ff-rank-gold': {
  				50: '#fefce8',
  				100: '#fef9c3',
  				200: '#fef08a',
  				300: '#fde047',
  				400: '#facc15',
  				500: '#eab308',
  				600: '#ca8a04',
  				700: '#a16207',
  				800: '#854d0e',
  				900: '#713f12'
  			},
  			'ff-rank-silver': {
  				50: '#fff7ed',
  				100: '#ffedd5',
  				200: '#fed7aa',
  				300: '#fdba74',
  				400: '#fb923c',
  				500: '#f97316',
  				600: '#ea580c',
  				700: '#c2410c',
  				800: '#9a3412',
  				900: '#7c2d12'
  			},
  			'ff-rank-bronze': {
  				50: '#f0fdf4',
  				100: '#dcfce7',
  				200: '#bbf7d0',
  				300: '#86efac',
  				400: '#4ade80',
  				500: '#22c55e',
  				600: '#16a34a',
  				700: '#15803d',
  				800: '#166534',
  				900: '#14532d'
  			},
  			'ff-status': {
  				completed: '#16a34a',
  				current: '#2563eb',
  				future: '#6b7280',
  				warning: '#ea580c',
  				error: '#dc2626'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(10px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'slide-in': {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(0)'
  				}
  			},
  			'modal-in': {
  				'0%': {
  					opacity: '0',
  					transform: 'scale(0.95) translateY(10px)',
  					backdropFilter: 'blur(0px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'scale(1) translateY(0)',
  					backdropFilter: 'blur(8px)'
  				}
  			},
  			'modal-out': {
  				'0%': {
  					opacity: '1',
  					transform: 'scale(1) translateY(0)',
  					backdropFilter: 'blur(8px)'
  				},
  				'100%': {
  					opacity: '0',
  					transform: 'scale(0.95) translateY(10px)',
  					backdropFilter: 'blur(0px)'
  				}
  			},
  			'backdrop-in': {
  				'0%': {
  					opacity: '0',
  					backdropFilter: 'blur(0px)'
  				},
  				'100%': {
  					opacity: '1',
  					backdropFilter: 'blur(8px)'
  				}
  			},
  			'backdrop-out': {
  				'0%': {
  					opacity: '1',
  					backdropFilter: 'blur(8px)'
  				},
  				'100%': {
  					opacity: '0',
  					backdropFilter: 'blur(0px)'
  				}
  			},
  			'float-in': {
  				'0%': {
  					opacity: '0',
  					transform: 'scale(0.8) translateY(20px)',
  					filter: 'blur(4px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'scale(1) translateY(0)',
  					filter: 'blur(0px)'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.4)',
  					transform: 'scale(1)'
  				},
  				'50%': {
  					boxShadow: '0 0 0 8px rgba(59, 130, 246, 0)',
  					transform: 'scale(1.02)'
  				}
  			},
  			shimmer: {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			},
  			'bounce-subtle': {
  				'0%, 100%': {
  					transform: 'translateY(0)'
  				},
  				'50%': {
  					transform: 'translateY(-2px)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.5s ease-out',
  			'slide-in': 'slide-in 0.3s ease-out',
  			'modal-in': 'modal-in 0.2s ease-out',
  			'modal-out': 'modal-out 0.15s ease-in',
  			'backdrop-in': 'backdrop-in 0.2s ease-out',
  			'backdrop-out': 'backdrop-out 0.15s ease-in',
  			'float-in': 'float-in 0.3s ease-out',
  			'pulse-glow': 'pulse-glow 2s infinite',
  			shimmer: 'shimmer 2s infinite',
  			'bounce-subtle': 'bounce-subtle 1s ease-in-out infinite'
  		},
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif'
  			],
  			mono: [
  				'ui-monospace',
  				'SFMono-Regular',
  				'Consolas',
  				'monospace'
  			]
  		}
  	}
  },
  variants: {
    extend: {
      backgroundColor: ['data-[state=checked]'],
      transform: ['data-[state=checked]'],
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}