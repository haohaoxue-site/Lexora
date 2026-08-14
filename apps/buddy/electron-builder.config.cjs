const { join } = require('node:path')
const process = require('node:process')
const { sourceDateEpoch } = require('./buddy.version.json')
const { desktopName, productName } = require('./package.json')

process.env.SOURCE_DATE_EPOCH ??= String(sourceDateEpoch)

const macro = name => `$${`{${name}}`}`

module.exports = {
  appId: desktopName,
  productName,
  asar: true,
  electronFuses: {
    enableCookieEncryption: true,
    enableNodeCliInspectArguments: false,
    enableNodeOptionsEnvironmentVariable: false,
    onlyLoadAppFromAsar: true,
    runAsNode: false,
  },
  npmRebuild: false,
  directories: {
    output: '.output/package/desktop',
  },
  files: [
    '.output/build/electron/**/*',
    'package.json',
  ],
  extraResources: [
    {
      from: join('.output', 'build', 'native-pet', 'release', 'lexora-buddy-pet'),
      to: join('native-pet', 'lexora-buddy-pet'),
    },
    {
      from: join('resources', 'icons'),
      to: 'icons',
    },
    {
      from: join('service', 'resources'),
      to: join('service', 'resources'),
    },
  ],
  linux: {
    category: 'Utility',
    executableName: 'lexora-buddy',
    icon: 'resources/icons/app',
    syncDesktopName: true,
    target: ['deb'],
  },
  deb: {
    depends: [
      'bubblewrap',
      'git',
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
      'libgtk-layer-shell0',
    ],
  },
  artifactName: `Lexora-Buddy-${macro('version')}-${macro('os')}-${macro('arch')}.${macro('ext')}`,
}
