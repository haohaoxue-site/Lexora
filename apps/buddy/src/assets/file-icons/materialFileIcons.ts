import cssIconUrl from './material/css.svg'
import documentIconUrl from './material/document.svg'
import fileIconUrl from './material/file.svg'
import folderOpenIconUrl from './material/folder-open.svg'
import folderIconUrl from './material/folder.svg'
import htmlIconUrl from './material/html.svg'
import javascriptIconUrl from './material/javascript.svg'
import jsonIconUrl from './material/json.svg'
import markdownIconUrl from './material/markdown.svg'
import pythonIconUrl from './material/python.svg'
import rustIconUrl from './material/rust.svg'
import sassIconUrl from './material/sass.svg'
import svgIconUrl from './material/svg.svg'
import tuneIconUrl from './material/tune.svg'
import typescriptIconUrl from './material/typescript.svg'
import vueIconUrl from './material/vue.svg'
import xmlIconUrl from './material/xml.svg'
import yamlIconUrl from './material/yaml.svg'

export const materialFolderIconUrls = {
  collapsed: folderIconUrl,
  expanded: folderOpenIconUrl,
} as const

export const materialFileIconUrls = {
  css: cssIconUrl,
  document: documentIconUrl,
  file: fileIconUrl,
  html: htmlIconUrl,
  javascript: javascriptIconUrl,
  json: jsonIconUrl,
  markdown: markdownIconUrl,
  python: pythonIconUrl,
  rust: rustIconUrl,
  sass: sassIconUrl,
  svg: svgIconUrl,
  tune: tuneIconUrl,
  typescript: typescriptIconUrl,
  vue: vueIconUrl,
  xml: xmlIconUrl,
  yaml: yamlIconUrl,
} as const

export type MaterialFileIconName = keyof typeof materialFileIconUrls

const ICON_BY_EXTENSION: Readonly<Record<string, MaterialFileIconName>> = {
  css: 'css',
  cts: 'typescript',
  htm: 'html',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  py: 'python',
  rs: 'rust',
  sass: 'sass',
  scss: 'sass',
  svg: 'svg',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'document',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

export function materialFileIconNameFromPath(path: string): MaterialFileIconName {
  const fileName = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
  if (fileName === '.env' || fileName.startsWith('.env.'))
    return 'tune'
  const extension = fileName.split('.').at(-1) ?? ''
  return ICON_BY_EXTENSION[extension] ?? 'file'
}
