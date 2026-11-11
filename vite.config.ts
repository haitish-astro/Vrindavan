import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Adds a strict Content-Security-Policy to the production build.
 * The page may only load its own files and talk to our Supabase project.
 * (Not applied in dev, where Vite needs inline scripts for hot reload.)
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  return {
    name: 'vrindavan-csp',
    apply: 'build',
    transformIndexHtml(html) {
      let origin = ''
      try {
        origin = new URL(supabaseUrl).origin
      } catch {
        // No Supabase URL configured — the app will show its setup screen.
      }
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' blob: data: ${origin}`.trim(),
        "font-src 'self'",
        `connect-src 'self' ${origin}`.trim(),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace(
        '<!--csp-->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  return {
    // Relative asset paths + HashRouter work on GitHub Pages under any repo name.
    base: './',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    build: { sourcemap: false },
  }
})
