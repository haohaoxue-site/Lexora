import process from 'node:process'
import { Temporal } from '@buddy-shared/temporal'
import { createBuddyNativeEnvironment } from './platform/nativeHost'

Object.assign(globalThis, { Temporal })
Object.assign(process.env, createBuddyNativeEnvironment({ appPath: import.meta.dirname, resourcesPath: '', isPackaged: false }))
