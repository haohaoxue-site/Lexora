import angularIconUrl from './assets/material/angular.svg'
import astroIconUrl from './assets/material/astro.svg'
import audioIconUrl from './assets/material/audio.svg'
import blenderIconUrl from './assets/material/blender.svg'
import cIconUrl from './assets/material/c.svg'
import certificateIconUrl from './assets/material/certificate.svg'
import clojureIconUrl from './assets/material/clojure.svg'
import cmakeIconUrl from './assets/material/cmake.svg'
import consoleIconUrl from './assets/material/console.svg'
import cppIconUrl from './assets/material/cpp.svg'
import csharpIconUrl from './assets/material/csharp.svg'
import cssIconUrl from './assets/material/css.svg'
import dartIconUrl from './assets/material/dart.svg'
import databaseIconUrl from './assets/material/database.svg'
import dockerIconUrl from './assets/material/docker.svg'
import documentIconUrl from './assets/material/document.svg'
import elixirIconUrl from './assets/material/elixir.svg'
import epubIconUrl from './assets/material/epub.svg'
import erlangIconUrl from './assets/material/erlang.svg'
import figmaIconUrl from './assets/material/figma.svg'
import fileIconUrl from './assets/material/file.svg'
import folderOpenIconUrl from './assets/material/folder-open.svg'
import folderIconUrl from './assets/material/folder.svg'
import fontIconUrl from './assets/material/font.svg'
import gitIconUrl from './assets/material/git.svg'
import goIconUrl from './assets/material/go.svg'
import gradleIconUrl from './assets/material/gradle.svg'
import haskellIconUrl from './assets/material/haskell.svg'
import htmlIconUrl from './assets/material/html.svg'
import imageIconUrl from './assets/material/image.svg'
import javaIconUrl from './assets/material/java.svg'
import javascriptIconUrl from './assets/material/javascript.svg'
import jsonIconUrl from './assets/material/json.svg'
import jupyterIconUrl from './assets/material/jupyter.svg'
import keyIconUrl from './assets/material/key.svg'
import kotlinIconUrl from './assets/material/kotlin.svg'
import kubernetesIconUrl from './assets/material/kubernetes.svg'
import luaIconUrl from './assets/material/lua.svg'
import makefileIconUrl from './assets/material/makefile.svg'
import markdownIconUrl from './assets/material/markdown.svg'
import nginxIconUrl from './assets/material/nginx.svg'
import npmIconUrl from './assets/material/npm.svg'
import pdfIconUrl from './assets/material/pdf.svg'
import perlIconUrl from './assets/material/perl.svg'
import phpIconUrl from './assets/material/php.svg'
import powerpointIconUrl from './assets/material/powerpoint.svg'
import powershellIconUrl from './assets/material/powershell.svg'
import pythonIconUrl from './assets/material/python.svg'
import rIconUrl from './assets/material/r.svg'
import reactIconUrl from './assets/material/react.svg'
import rubyIconUrl from './assets/material/ruby.svg'
import rustIconUrl from './assets/material/rust.svg'
import sassIconUrl from './assets/material/sass.svg'
import scalaIconUrl from './assets/material/scala.svg'
import settingsIconUrl from './assets/material/settings.svg'
import sketchIconUrl from './assets/material/sketch.svg'
import svelteIconUrl from './assets/material/svelte.svg'
import svgIconUrl from './assets/material/svg.svg'
import swiftIconUrl from './assets/material/swift.svg'
import tableIconUrl from './assets/material/table.svg'
import terraformIconUrl from './assets/material/terraform.svg'
import tomlIconUrl from './assets/material/toml.svg'
import tuneIconUrl from './assets/material/tune.svg'
import typescriptIconUrl from './assets/material/typescript.svg'
import videoIconUrl from './assets/material/video.svg'
import vueIconUrl from './assets/material/vue.svg'
import wordIconUrl from './assets/material/word.svg'
import xmlIconUrl from './assets/material/xml.svg'
import yamlIconUrl from './assets/material/yaml.svg'
import zipIconUrl from './assets/material/zip.svg'

export const FOLDER_ICON_URLS = {
  collapsed: folderIconUrl,
  expanded: folderOpenIconUrl,
} as const

export const FILE_ICON_URLS = {
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

export type FileIconName = keyof typeof FILE_ICON_URLS
