import { Module } from '@nestjs/common'
import { PublisherModule } from '../../infrastructure/publisher/publisher.module'
import { RedisModule } from '../../infrastructure/redis/redis.module'
import { StorageModule } from '../../infrastructure/storage/storage.module'

// asset
import { DocumentAssetController } from './asset/asset.controller'
import { DocumentAssetsService } from './asset/asset.service'
import { DocumentCollabInternalController } from './asset/collab-internal.controller'
import { DocumentCollabTicketsService } from './asset/collab-ticket.service'

// content
import { DocumentContentController } from './content/content.controller'
import { DocumentContentService } from './content/content.service'
import { DocumentYdocsService } from './content/ydocs.service'

// core (cross-subdomain)
import { DocumentAccessService } from './core/access.service'

// operations
import { DocumentOperationQueueService } from './operations/operation-queue.service'
import { DocumentOperationProcessor } from './operations/operation.processor'
import { DocumentOperationsController } from './operations/operations.controller'
import { DocumentOperationsService } from './operations/operations.service'

// share
import { DocumentShareAccessService } from './share/share-access.service'
import { DocumentShareManagementController } from './share/share-management.controller'
import { DocumentShareRecipientsController } from './share/share-recipients.controller'
import { DocumentShareRecipientsService } from './share/share-recipients.service'
import { DocumentSharesController } from './share/shares.controller'
import { DocumentSharesService } from './share/shares.service'

// trash
import { DocumentTrashController } from './trash/trash.controller'
import { DocumentTrashService } from './trash/trash.service'

// tree
import { DocumentTreeController } from './tree/tree.controller'
import { DocumentsService } from './tree/tree.service'

@Module({
  imports: [StorageModule, PublisherModule, RedisModule],
  controllers: [
    // 入站：自有文档
    DocumentTreeController,
    DocumentContentController,
    DocumentTrashController,
    DocumentAssetController,
    DocumentShareManagementController,
    DocumentOperationsController,
    // 入站：分享接收侧
    DocumentSharesController,
    DocumentShareRecipientsController,
    // 入站：内部 collab 服务调用
    DocumentCollabInternalController,
  ],
  providers: [
    DocumentAccessService,
    DocumentsService,
    DocumentContentService,
    DocumentYdocsService,
    DocumentAssetsService,
    DocumentCollabTicketsService,
    DocumentSharesService,
    DocumentShareAccessService,
    DocumentShareRecipientsService,
    DocumentTrashService,
    DocumentOperationQueueService,
    DocumentOperationsService,
    DocumentOperationProcessor,
  ],
  exports: [
    DocumentAccessService,
    DocumentContentService,
    DocumentShareAccessService,
    DocumentShareRecipientsService,
    DocumentSharesService,
  ],
})
export class DocumentsModule {}
