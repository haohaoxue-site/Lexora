const { join } = require('node:path')
const process = require('node:process')
const { sourceDateEpoch } = require('./buddy.version.json')
const { desktopName, productName: displayName } = require('./package.json')

process.env.SOURCE_DATE_EPOCH ??= String(sourceDateEpoch)

const macro = name => `$${`{${name}}`}`

module.exports = {
  appId: desktopName,
  productName: 'lexora-buddy',
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
    desktop: {
      entry: {
        Name: displayName,
      },
    },
    executableName: 'lexora-buddy',
    icon: 'resources/icons/app',
    synopsis: 'Lexora Buddy local personal AI companion and native desktop pet',
    syncDesktopName: true,
    target: ['deb'],
  },
  deb: {
    packageName: 'lexora-buddy',
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
      'webp-pixbuf-loader',
    ],
  },
  pacman: {
    artifactName: `Lexora-Buddy-${macro('version')}-arch-x86_64.pkg.tar.zst`,
    compression: 'zstd',
    packageName: 'lexora-buddy',
    depends: [
      'alsa-lib',
      'at-spi2-core',
      'bubblewrap',
      'cairo',
      'dbus',
      'desktop-file-utils',
      'expat',
      'gcc-libs',
      'glib2',
      'glibc',
      'git',
      'gtk-layer-shell',
      'gtk3',
      'hicolor-icon-theme',
      'libcups',
      'libnotify',
      'libsecret',
      'libx11',
      'libxcb',
      'libxcomposite',
      'libxdamage',
      'libxext',
      'libxfixes',
      'libxkbcommon',
      'libxrandr',
      'libxss',
      'libxtst',
      'mesa',
      'nspr',
      'nss',
      'pango',
      'systemd-libs',
      'util-linux-libs',
      'xdg-utils',
    ],
  },
  artifactName: `Lexora-Buddy-${macro('version')}-${macro('os')}-${macro('arch')}.${macro('ext')}`,
}
