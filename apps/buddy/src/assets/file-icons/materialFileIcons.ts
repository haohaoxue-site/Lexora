import angularIconUrl from './material/angular.svg'
import astroIconUrl from './material/astro.svg'
import audioIconUrl from './material/audio.svg'
import blenderIconUrl from './material/blender.svg'
import cIconUrl from './material/c.svg'
import certificateIconUrl from './material/certificate.svg'
import clojureIconUrl from './material/clojure.svg'
import cmakeIconUrl from './material/cmake.svg'
import consoleIconUrl from './material/console.svg'
import cppIconUrl from './material/cpp.svg'
import csharpIconUrl from './material/csharp.svg'
import cssIconUrl from './material/css.svg'
import dartIconUrl from './material/dart.svg'
import databaseIconUrl from './material/database.svg'
import dockerIconUrl from './material/docker.svg'
import documentIconUrl from './material/document.svg'
import elixirIconUrl from './material/elixir.svg'
import epubIconUrl from './material/epub.svg'
import erlangIconUrl from './material/erlang.svg'
import figmaIconUrl from './material/figma.svg'
import fileIconUrl from './material/file.svg'
import folderOpenIconUrl from './material/folder-open.svg'
import folderIconUrl from './material/folder.svg'
import fontIconUrl from './material/font.svg'
import gitIconUrl from './material/git.svg'
import goIconUrl from './material/go.svg'
import gradleIconUrl from './material/gradle.svg'
import haskellIconUrl from './material/haskell.svg'
import htmlIconUrl from './material/html.svg'
import imageIconUrl from './material/image.svg'
import javaIconUrl from './material/java.svg'
import javascriptIconUrl from './material/javascript.svg'
import jsonIconUrl from './material/json.svg'
import jupyterIconUrl from './material/jupyter.svg'
import keyIconUrl from './material/key.svg'
import kotlinIconUrl from './material/kotlin.svg'
import kubernetesIconUrl from './material/kubernetes.svg'
import luaIconUrl from './material/lua.svg'
import makefileIconUrl from './material/makefile.svg'
import markdownIconUrl from './material/markdown.svg'
import nginxIconUrl from './material/nginx.svg'
import npmIconUrl from './material/npm.svg'
import pdfIconUrl from './material/pdf.svg'
import perlIconUrl from './material/perl.svg'
import phpIconUrl from './material/php.svg'
import powerpointIconUrl from './material/powerpoint.svg'
import powershellIconUrl from './material/powershell.svg'
import pythonIconUrl from './material/python.svg'
import rIconUrl from './material/r.svg'
import reactIconUrl from './material/react.svg'
import rubyIconUrl from './material/ruby.svg'
import rustIconUrl from './material/rust.svg'
import sassIconUrl from './material/sass.svg'
import scalaIconUrl from './material/scala.svg'
import settingsIconUrl from './material/settings.svg'
import sketchIconUrl from './material/sketch.svg'
import svelteIconUrl from './material/svelte.svg'
import svgIconUrl from './material/svg.svg'
import swiftIconUrl from './material/swift.svg'
import tableIconUrl from './material/table.svg'
import terraformIconUrl from './material/terraform.svg'
import tomlIconUrl from './material/toml.svg'
import tuneIconUrl from './material/tune.svg'
import typescriptIconUrl from './material/typescript.svg'
import videoIconUrl from './material/video.svg'
import vueIconUrl from './material/vue.svg'
import wordIconUrl from './material/word.svg'
import xmlIconUrl from './material/xml.svg'
import yamlIconUrl from './material/yaml.svg'
import zipIconUrl from './material/zip.svg'

export const materialFolderIconUrls = {
  collapsed: folderIconUrl,
  expanded: folderOpenIconUrl,
} as const

export const materialFileIconUrls = {
  audio: audioIconUrl,
  angular: angularIconUrl,
  astro: astroIconUrl,
  blender: blenderIconUrl,
  c: cIconUrl,
  certificate: certificateIconUrl,
  clojure: clojureIconUrl,
  cmake: cmakeIconUrl,
  console: consoleIconUrl,
  cpp: cppIconUrl,
  csharp: csharpIconUrl,
  css: cssIconUrl,
  database: databaseIconUrl,
  dart: dartIconUrl,
  document: documentIconUrl,
  docker: dockerIconUrl,
  elixir: elixirIconUrl,
  epub: epubIconUrl,
  erlang: erlangIconUrl,
  file: fileIconUrl,
  figma: figmaIconUrl,
  font: fontIconUrl,
  git: gitIconUrl,
  go: goIconUrl,
  gradle: gradleIconUrl,
  haskell: haskellIconUrl,
  html: htmlIconUrl,
  image: imageIconUrl,
  javascript: javascriptIconUrl,
  java: javaIconUrl,
  jupyter: jupyterIconUrl,
  json: jsonIconUrl,
  key: keyIconUrl,
  kotlin: kotlinIconUrl,
  kubernetes: kubernetesIconUrl,
  lua: luaIconUrl,
  makefile: makefileIconUrl,
  markdown: markdownIconUrl,
  nginx: nginxIconUrl,
  npm: npmIconUrl,
  pdf: pdfIconUrl,
  perl: perlIconUrl,
  php: phpIconUrl,
  powerpoint: powerpointIconUrl,
  powershell: powershellIconUrl,
  python: pythonIconUrl,
  r: rIconUrl,
  react: reactIconUrl,
  ruby: rubyIconUrl,
  rust: rustIconUrl,
  sass: sassIconUrl,
  scala: scalaIconUrl,
  settings: settingsIconUrl,
  sketch: sketchIconUrl,
  svelte: svelteIconUrl,
  swift: swiftIconUrl,
  svg: svgIconUrl,
  table: tableIconUrl,
  terraform: terraformIconUrl,
  toml: tomlIconUrl,
  tune: tuneIconUrl,
  typescript: typescriptIconUrl,
  vue: vueIconUrl,
  video: videoIconUrl,
  word: wordIconUrl,
  xml: xmlIconUrl,
  yaml: yamlIconUrl,
  zip: zipIconUrl,
} as const

export type MaterialFileIconName = keyof typeof materialFileIconUrls

const ICON_BY_EXTENSION: Readonly<Record<string, MaterialFileIconName>> = {
  '3gp': 'video',
  '7z': 'zip',
  'aac': 'audio',
  'apng': 'image',
  'avi': 'video',
  'avif': 'image',
  'bash': 'console',
  'bat': 'console',
  'bmp': 'image',
  'bz': 'zip',
  'bz2': 'zip',
  'cfg': 'settings',
  'cmd': 'console',
  'conf': 'settings',
  'css': 'css',
  'cts': 'typescript',
  'csv': 'table',
  'db': 'database',
  'flac': 'audio',
  'fish': 'console',
  'gif': 'image',
  'gz': 'zip',
  'heic': 'image',
  'heif': 'image',
  'htm': 'html',
  'html': 'html',
  'ico': 'image',
  'ini': 'settings',
  'jfif': 'image',
  'js': 'javascript',
  'jpeg': 'image',
  'jpg': 'image',
  'json': 'json',
  'jsonc': 'json',
  'jsx': 'react',
  'md': 'markdown',
  'mdx': 'markdown',
  'mjs': 'javascript',
  'm4a': 'audio',
  'm4v': 'video',
  'mkv': 'video',
  'mov': 'video',
  'mp3': 'audio',
  'mp4': 'video',
  'mpeg': 'video',
  'mpg': 'video',
  'mts': 'typescript',
  'odp': 'powerpoint',
  'ods': 'table',
  'odt': 'word',
  'ogg': 'audio',
  'opus': 'audio',
  'pdf': 'pdf',
  'ppt': 'powerpoint',
  'pptx': 'powerpoint',
  'prisma': 'database',
  'properties': 'settings',
  'py': 'python',
  'png': 'image',
  'rar': 'zip',
  'rtf': 'word',
  'rs': 'rust',
  'sass': 'sass',
  'scss': 'sass',
  'sh': 'console',
  'sql': 'database',
  'sqlite': 'database',
  'sqlite3': 'database',
  'svg': 'svg',
  'tar': 'zip',
  'tgz': 'zip',
  'toml': 'toml',
  'ts': 'typescript',
  'tsx': 'react',
  'tsv': 'table',
  'txt': 'document',
  'tif': 'image',
  'tiff': 'image',
  'wav': 'audio',
  'vue': 'vue',
  'webm': 'video',
  'webp': 'image',
  'wma': 'audio',
  'wmv': 'video',
  'xls': 'table',
  'xlsx': 'table',
  'xz': 'zip',
  'xml': 'xml',
  'yaml': 'yaml',
  'yml': 'yaml',
  'zip': 'zip',
  'zsh': 'console',
  'astro': 'astro',
  'blend': 'blender',
  'c': 'c',
  'cer': 'certificate',
  'cert': 'certificate',
  'clj': 'clojure',
  'cljc': 'clojure',
  'cljs': 'clojure',
  'cmake': 'cmake',
  'cp': 'cpp',
  'cpp': 'cpp',
  'crt': 'certificate',
  'cs': 'csharp',
  'cxx': 'cpp',
  'dart': 'dart',
  'der': 'certificate',
  'eot': 'font',
  'epub': 'epub',
  'erl': 'erlang',
  'ex': 'elixir',
  'exs': 'elixir',
  'fig': 'figma',
  'go': 'go',
  'gradle': 'gradle',
  'h': 'c',
  'hcl': 'terraform',
  'hrl': 'erlang',
  'hs': 'haskell',
  'ipynb': 'jupyter',
  'java': 'java',
  'key': 'key',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'lua': 'lua',
  'mak': 'makefile',
  'otf': 'font',
  'p12': 'certificate',
  'pem': 'key',
  'php': 'php',
  'phtml': 'php',
  'pl': 'perl',
  'pm': 'perl',
  'ppk': 'key',
  'ps1': 'powershell',
  'psd1': 'powershell',
  'psm1': 'powershell',
  'r': 'r',
  'rb': 'ruby',
  'sc': 'scala',
  'scala': 'scala',
  'sketch': 'sketch',
  'svelte': 'svelte',
  'swift': 'swift',
  'tf': 'terraform',
  'tfstate': 'terraform',
  'tfvars': 'terraform',
  'ttf': 'font',
  'woff': 'font',
  'woff2': 'font',
}

const ICON_BY_FILE_NAME: Readonly<Record<string, MaterialFileIconName>> = {
  '.gitattributes': 'git',
  '.gitignore': 'git',
  '.gitmodules': 'git',
  '.terraform.lock.hcl': 'terraform',
  'angular.json': 'angular',
  'build.gradle': 'gradle',
  'cmakelists.txt': 'cmake',
  'compose.yaml': 'docker',
  'compose.yml': 'docker',
  'dockerfile': 'docker',
  'docker-compose.yaml': 'docker',
  'docker-compose.yml': 'docker',
  'gnumakefile': 'makefile',
  'kustomization.yaml': 'kubernetes',
  'kustomization.yml': 'kubernetes',
  'makefile': 'makefile',
  'nginx.conf': 'nginx',
  'package-lock.json': 'npm',
  'package.json': 'npm',
  'pnpm-lock.yaml': 'npm',
  'rakefile': 'ruby',
  'settings.gradle': 'gradle',
  'yarn.lock': 'npm',
}

export function materialFileIconNameFromPath(path: string): MaterialFileIconName {
  const fileName = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
  if (fileName === '.env' || fileName.startsWith('.env.'))
    return 'tune'
  const iconByFileName = ICON_BY_FILE_NAME[fileName]
  if (iconByFileName)
    return iconByFileName
  const extension = fileName.split('.').at(-1) ?? ''
  return ICON_BY_EXTENSION[extension] ?? 'file'
}
