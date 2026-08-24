UPDATE "permissions"
SET "name" = '审核、发布、驳回与下线资讯',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'content.article.publish';
