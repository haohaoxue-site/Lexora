import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { agentSkillsConfig } from './agent-skills.config'
import { bootstrapConfig, cryptoConfig, jwtConfig, oauthConfig } from './auth.config'
import { collabConfig } from './collab.config'
import { databaseConfig } from './database.config'
import { validateEnv } from './env.schema'
import { loggerConfig } from './logger.config'
import { redisConfig } from './redis.config'
import { serverConfig } from './server.config'
import { storageConfig } from './storage.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [serverConfig, loggerConfig, databaseConfig, jwtConfig, oauthConfig, bootstrapConfig, cryptoConfig, storageConfig, collabConfig, redisConfig, agentSkillsConfig],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
