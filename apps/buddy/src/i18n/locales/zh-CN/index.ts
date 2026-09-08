import app from './app'
import approvals from './approvals'
import automations from './automations'
import chat from './chat'
import diagnostics from './diagnostics'
import models from './models'
import pet from './pet'
import settings from './settings'
import tasks from './tasks'

export default {
  ...app,
  ...approvals,
  ...automations,
  ...chat,
  ...diagnostics,
  ...models,
  ...pet,
  ...settings,
  ...tasks,
}
