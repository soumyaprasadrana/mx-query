import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitepress'

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
)

const repo = process.env.GITHUB_REPOSITORY ?? 'soumyaprasadrana/mx-query'
const github = `https://github.com/${repo}`

const base =
  process.env.DOCS_BASE ??
  (process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/')

export default defineConfig({
  base,
  title: 'mxQuery',
  description: 'Visual OSLC query studio for IBM Maximo',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#7C3AED' }],
    ['meta', { name: 'og:image', content: `${base}logo.svg` }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'mxQuery' }],
    ['meta', { property: 'og:description', content: 'Visual OSLC query studio for IBM Maximo' }],
    ['meta', { property: 'og:site_name', content: 'mxQuery' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
  ],
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'mxQuery' },
    siteTitle: 'mxQuery',
    outline: { level: [2, 3], label: 'On this page' },
    nav: [
      { text: 'Get started', link: '/getting-started' },
      {
        text: 'Guide',
        activeMatch: '/guide/',
        items: [
          { text: 'Screens', link: '/guide/screens' },
          { text: 'Wizard', link: '/guide/wizard' },
          { text: 'Builder', link: '/guide/builder' },
          { text: 'Library', link: '/guide/library' },
          { text: 'Assist', link: '/guide/assist' },
        ],
      },
      { text: 'Deploy', link: '/deployment' },
      { text: 'Architecture', link: '/architecture' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog / releases', link: `${github}/releases` },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'What mxQuery is', link: '/introduction' },
          { text: 'Install and first tenant', link: '/getting-started' },
        ],
      },
      {
        text: 'Using the app',
        items: [
          { text: 'Screens and Back', link: '/guide/screens' },
          { text: 'Wizard', link: '/guide/wizard' },
          { text: 'Builder', link: '/guide/builder' },
          { text: 'Saved queries', link: '/guide/library' },
          { text: 'Assist', link: '/guide/assist' },
        ],
      },
      {
        text: 'Operate',
        items: [
          { text: 'Configuration', link: '/configuration' },
          { text: 'Deployment', link: '/deployment' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: github }],
    footer: {
      message: 'Apache-2.0. Queries run through maximo-mcp-server, not a copy of OSLC in the browser.',
      copyright: `© ${new Date().getFullYear()} Soumya Prasad Rana`,
    },
    search: { provider: 'local' },
  },
})
