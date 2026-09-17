-- 微信手机号授权前的用户协议与隐私政策同意留痕。
ALTER TABLE "wechat_identities"
  ADD COLUMN "serviceAgreementVersion" TEXT,
  ADD COLUMN "privacyPolicyVersion" TEXT,
  ADD COLUMN "consentedAt" TIMESTAMP(3);
