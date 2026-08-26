import type { GlobalThemeOverrides } from 'naive-ui'

export type BuddyColorScheme = 'light' | 'dark'

interface BuddyColorTheme {
  colorScheme: BuddyColorScheme
  surface: {
    canvas: string
    raised: string
    muted: string
  }
  state: {
    hover: string
    pressed: string
    selected: string
  }
  border: {
    subtle: string
    strong: string
  }
  text: {
    strong: string
    primary: string
    secondary: string
    disabled: string
    onAccent: string
  }
  accent: {
    solid: string
    solidHover: string
    solidPressed: string
    text: string
    focus: string
    surfaceSubtle: string
    surface: string
    surfaceHover: string
    border: string
    onSurface: string
  }
  status: {
    success: BuddyStatusColors
    warning: BuddyStatusColors
    danger: BuddyStatusColors
  }
  brand: {
    gold: string
    goldSurface: string
  }
  avatar: {
    background: string
    foreground: string
  }
  data: {
    violet: string
    cyan: string
    blue: string
  }
  shadow: {
    soft: string
    raised: string
    overlay: string
    window: string
    illustration: string
  }
}

interface BuddyStatusColors {
  solid: string
  solidHover: string
  solidPressed: string
  text: string
  surface: string
  surfaceHover: string
  border: string
}

const lightTheme: BuddyColorTheme = {
  colorScheme: 'light',
  surface: {
    canvas: '#fafaf8',
    raised: '#ffffff',
    muted: 'rgb(32 37 34 / 4%)',
  },
  state: {
    hover: 'rgb(32 37 34 / 5%)',
    pressed: 'rgb(32 37 34 / 12%)',
    selected: 'rgb(32 37 34 / 8%)',
  },
  border: {
    subtle: 'rgb(32 37 34 / 10%)',
    strong: 'rgb(32 37 34 / 18%)',
  },
  text: {
    strong: '#202522',
    primary: '#414844',
    secondary: '#666e69',
    disabled: '#929994',
    onAccent: '#ffffff',
  },
  accent: {
    solid: '#506b90',
    solidHover: '#5b769c',
    solidPressed: '#40597b',
    text: '#40597b',
    focus: '#506b90',
    surfaceSubtle: 'rgb(80 107 144 / 7%)',
    surface: 'rgb(80 107 144 / 12%)',
    surfaceHover: 'rgb(80 107 144 / 16%)',
    border: 'rgb(80 107 144 / 38%)',
    onSurface: '#40597b',
  },
  status: {
    success: {
      solid: '#287550',
      solidHover: '#2d8059',
      solidPressed: '#226343',
      text: '#287550',
      surface: '#e8f4ed',
      surfaceHover: '#deede4',
      border: '#a9d6bd',
    },
    warning: {
      solid: '#89591e',
      solidHover: '#936020',
      solidPressed: '#744a18',
      text: '#89591e',
      surface: '#fbf1e3',
      surfaceHover: '#f6e7d1',
      border: '#e4c28e',
    },
    danger: {
      solid: '#b94747',
      solidHover: '#c14d4d',
      solidPressed: '#9f3d3d',
      text: '#b94747',
      surface: '#f9eaea',
      surfaceHover: '#f3dddd',
      border: '#e3adad',
    },
  },
  brand: {
    gold: '#b97a25',
    goldSurface: '#f7eddd',
  },
  avatar: {
    background: '#b7bec5',
    foreground: '#fafaf8',
  },
  data: {
    violet: '#7569a7',
    cyan: '#4f8994',
    blue: '#5d79ad',
  },
  shadow: {
    soft: '0 1px 3px rgb(31 37 33 / 9%)',
    raised: '0 10px 28px rgb(31 37 33 / 10%)',
    overlay: '0 1px 2px rgb(31 37 33 / 8%), 0 8px 18px rgb(31 37 33 / 12%)',
    window: 'inset 0 0 0 1px rgb(255 255 255 / 70%), 0 12px 32px rgb(31 37 33 / 10%)',
    illustration: '0 4px 11px rgb(31 37 33 / 10%), 0 18px 42px rgb(31 37 33 / 14%)',
  },
}

const darkTheme: BuddyColorTheme = {
  colorScheme: 'dark',
  surface: {
    canvas: '#202422',
    raised: '#2a2f2b',
    muted: 'rgb(255 255 255 / 5%)',
  },
  state: {
    hover: 'rgb(255 255 255 / 7%)',
    pressed: 'rgb(255 255 255 / 13%)',
    selected: 'rgb(255 255 255 / 10%)',
  },
  border: {
    subtle: 'rgb(255 255 255 / 11%)',
    strong: 'rgb(255 255 255 / 20%)',
  },
  text: {
    strong: '#f2f4f0',
    primary: '#d5dad5',
    secondary: '#aab1ab',
    disabled: '#737a74',
    onAccent: '#ffffff',
  },
  accent: {
    solid: '#506b90',
    solidHover: '#5b769c',
    solidPressed: '#40597b',
    text: '#91abcc',
    focus: '#91abcc',
    surfaceSubtle: 'rgb(145 171 204 / 8%)',
    surface: 'rgb(145 171 204 / 13%)',
    surfaceHover: 'rgb(145 171 204 / 18%)',
    border: 'rgb(145 171 204 / 38%)',
    onSurface: '#a9bed8',
  },
  status: {
    success: {
      solid: '#287550',
      solidHover: '#2d8059',
      solidPressed: '#226343',
      text: '#70ce9c',
      surface: '#21362b',
      surfaceHover: '#294334',
      border: '#3f7559',
    },
    warning: {
      solid: '#89591e',
      solidHover: '#936020',
      solidPressed: '#744a18',
      text: '#e2ad64',
      surface: '#3b3022',
      surfaceHover: '#483a28',
      border: '#7d623b',
    },
    danger: {
      solid: '#b94747',
      solidHover: '#c14d4d',
      solidPressed: '#9f3d3d',
      text: '#ef9898',
      surface: '#3d2929',
      surfaceHover: '#4b3030',
      border: '#865050',
    },
  },
  brand: {
    gold: '#dda64f',
    goldSurface: '#3c3223',
  },
  avatar: {
    background: '#59616b',
    foreground: '#f2f4f0',
  },
  data: {
    violet: '#9a8bd1',
    cyan: '#68adb8',
    blue: '#7795c7',
  },
  shadow: {
    soft: '0 1px 3px rgb(0 0 0 / 18%)',
    raised: '0 10px 28px rgb(0 0 0 / 28%)',
    overlay: '0 1px 2px rgb(0 0 0 / 22%), 0 8px 18px rgb(0 0 0 / 30%)',
    window: 'inset 0 0 0 1px rgb(255 255 255 / 5%), 0 12px 32px rgb(0 0 0 / 30%)',
    illustration: '0 4px 11px rgb(0 0 0 / 20%), 0 18px 42px rgb(0 0 0 / 32%)',
  },
}

export const buddyColorThemes = {
  dark: darkTheme,
  light: lightTheme,
} as const

export function createBuddyColorVariables(theme: BuddyColorTheme): Record<string, string> {
  return {
    '--buddy-surface-canvas': theme.surface.canvas,
    '--buddy-surface-app-sidebar': theme.surface.canvas,
    '--buddy-surface-workspace-sidebar': theme.surface.canvas,
    '--buddy-surface-base': theme.surface.canvas,
    '--buddy-surface-raised': theme.surface.raised,
    '--buddy-surface-subtle': theme.surface.muted,
    '--buddy-state-hover': theme.state.hover,
    '--buddy-state-pressed': theme.state.pressed,
    '--buddy-state-selected': theme.state.selected,
    '--buddy-nav-hover': theme.accent.surfaceSubtle,
    '--buddy-nav-selected': theme.accent.surface,
    '--buddy-nav-pressed': theme.accent.surfaceHover,
    '--buddy-nav-foreground': theme.accent.onSurface,
    '--buddy-border-subtle': theme.border.subtle,
    '--buddy-border-strong': theme.border.strong,
    '--buddy-text-strong': theme.text.strong,
    '--buddy-text-primary': theme.text.primary,
    '--buddy-text-secondary': theme.text.secondary,
    '--buddy-text-muted': theme.text.secondary,
    '--buddy-text-disabled': theme.text.disabled,
    '--buddy-text-on-accent': theme.text.onAccent,
    '--buddy-accent-solid': theme.accent.solid,
    '--buddy-accent-solid-hover': theme.accent.solidHover,
    '--buddy-accent-solid-pressed': theme.accent.solidPressed,
    '--buddy-accent-text': theme.accent.text,
    '--buddy-focus-ring': theme.accent.focus,
    '--buddy-accent-surface-subtle': theme.accent.surfaceSubtle,
    '--buddy-accent-surface': theme.accent.surface,
    '--buddy-accent-surface-hover': theme.accent.surfaceHover,
    '--buddy-accent-border': theme.accent.border,
    '--buddy-accent-on-surface': theme.accent.onSurface,
    '--buddy-status-success-solid': theme.status.success.solid,
    '--buddy-status-success-text': theme.status.success.text,
    '--buddy-status-success-surface': theme.status.success.surface,
    '--buddy-status-success-surface-hover': theme.status.success.surfaceHover,
    '--buddy-status-success-border': theme.status.success.border,
    '--buddy-status-warning-solid': theme.status.warning.solid,
    '--buddy-status-warning-text': theme.status.warning.text,
    '--buddy-status-warning-surface': theme.status.warning.surface,
    '--buddy-status-warning-surface-hover': theme.status.warning.surfaceHover,
    '--buddy-status-warning-border': theme.status.warning.border,
    '--buddy-status-danger-solid': theme.status.danger.solid,
    '--buddy-status-danger-text': theme.status.danger.text,
    '--buddy-status-danger-surface': theme.status.danger.surface,
    '--buddy-status-danger-surface-hover': theme.status.danger.surfaceHover,
    '--buddy-status-danger-border': theme.status.danger.border,
    '--buddy-brand-gold': theme.brand.gold,
    '--buddy-brand-gold-surface': theme.brand.goldSurface,
    '--buddy-avatar-background': theme.avatar.background,
    '--buddy-avatar-foreground': theme.avatar.foreground,
    '--buddy-data-violet': theme.data.violet,
    '--buddy-data-cyan': theme.data.cyan,
    '--buddy-data-blue': theme.data.blue,
    '--buddy-shadow-soft': theme.shadow.soft,
    '--buddy-shadow-raised': theme.shadow.raised,
    '--buddy-shadow-overlay': theme.shadow.overlay,
    '--buddy-shadow-window': theme.shadow.window,
    '--buddy-shadow-illustration': theme.shadow.illustration,
    '--buddy-media-overlay-background': 'rgb(29 33 31 / 88%)',
    '--buddy-media-overlay-border': 'rgb(255 255 255 / 14%)',
    '--buddy-media-overlay-divider': 'rgb(255 255 255 / 16%)',
    '--buddy-media-overlay-text': 'rgb(255 255 255 / 82%)',
    '--buddy-media-overlay-hover': 'rgb(255 255 255 / 13%)',
    '--buddy-media-overlay-focus': '#91abcc',
    '--buddy-media-overlay-danger-hover': 'rgb(185 71 71 / 72%)',
    '--buddy-media-overlay-shadow': '0 8px 22px rgb(0 0 0 / 18%), 0 2px 6px rgb(0 0 0 / 12%)',
  }
}

export function createBuddyNaiveThemeOverrides(theme: BuddyColorTheme): GlobalThemeOverrides {
  return {
    Tooltip: {
      borderRadius: '6px',
      boxShadow: theme.shadow.overlay,
      color: theme.surface.raised,
      padding: '7px 10px',
      textColor: theme.text.primary,
    },
    common: {
      actionColor: theme.surface.muted,
      avatarColor: theme.avatar.background,
      baseColor: theme.text.onAccent,
      bodyColor: theme.surface.canvas,
      borderColor: theme.border.strong,
      boxShadow1: theme.shadow.soft,
      boxShadow2: theme.shadow.raised,
      boxShadow3: theme.shadow.overlay,
      buttonColor2: theme.surface.muted,
      buttonColor2Hover: theme.state.hover,
      buttonColor2Pressed: theme.state.pressed,
      cardColor: theme.surface.raised,
      codeColor: theme.surface.muted,
      dividerColor: theme.border.subtle,
      errorColor: theme.status.danger.solid,
      errorColorHover: theme.status.danger.solidHover,
      errorColorPressed: theme.status.danger.solidPressed,
      errorColorSuppl: theme.status.danger.solidHover,
      fontFamily: 'var(--buddy-font-ui)',
      fontFamilyMono: 'var(--buddy-font-mono)',
      hoverColor: theme.state.hover,
      iconColor: theme.text.secondary,
      iconColorDisabled: theme.text.disabled,
      iconColorHover: theme.text.strong,
      iconColorPressed: theme.text.primary,
      infoColor: theme.accent.solid,
      infoColorHover: theme.accent.solidHover,
      infoColorPressed: theme.accent.solidPressed,
      infoColorSuppl: theme.accent.solidHover,
      inputColor: theme.surface.raised,
      inputColorDisabled: theme.surface.muted,
      modalColor: theme.surface.raised,
      placeholderColor: theme.text.secondary,
      placeholderColorDisabled: theme.text.disabled,
      popoverColor: theme.surface.raised,
      pressedColor: theme.state.pressed,
      primaryColor: theme.accent.solid,
      primaryColorHover: theme.accent.solidHover,
      primaryColorPressed: theme.accent.solidPressed,
      primaryColorSuppl: theme.accent.solidHover,
      progressRailColor: theme.border.subtle,
      railColor: theme.border.subtle,
      scrollbarColor: theme.border.strong,
      scrollbarColorHover: theme.text.disabled,
      successColor: theme.status.success.solid,
      successColorHover: theme.status.success.solidHover,
      successColorPressed: theme.status.success.solidPressed,
      successColorSuppl: theme.status.success.solidHover,
      tableColor: theme.surface.raised,
      tableColorHover: theme.state.hover,
      tableColorStriped: theme.surface.muted,
      tableHeaderColor: theme.surface.muted,
      tabColor: theme.surface.canvas,
      tagColor: theme.surface.muted,
      textColor1: theme.text.strong,
      textColor2: theme.text.primary,
      textColor3: theme.text.secondary,
      textColorBase: theme.text.strong,
      textColorDisabled: theme.text.disabled,
      warningColor: theme.status.warning.solid,
      warningColorHover: theme.status.warning.solidHover,
      warningColorPressed: theme.status.warning.solidPressed,
      warningColorSuppl: theme.status.warning.solidHover,
    },
  }
}
