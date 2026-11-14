#!/usr/bin/env bash
# Deploy the static site to a private S3 bucket behind CloudFront (HTTPS).
# Idempotent: the first run creates everything; later runs upload changes and invalidate the cache.
#   Usage: AWS_PROFILE=default bash scripts/deploy-aws.sh
set -euo pipefail

cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
NAME="sustainerprice"
TAG="sustainerprice-demo"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${NAME}-demo-${ACCOUNT}-${REGION}"
echo "Account ${ACCOUNT:0:4}****, region $REGION, bucket $BUCKET"

# 1. Private bucket
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{Key=project,Value=$TAG}]"
  echo "Created bucket"
fi

# 2. Upload site files only (no tests, scripts, SQL or repo metadata)
aws s3 sync . "s3://$BUCKET" --delete --exclude "*" \
  --include "index.html" --include "app.html" --include "site.webmanifest" --include "css/*" --include "js/*" --include "assets/web/*" \
  --cache-control "public, max-age=300" >/dev/null
for page in index.html app.html; do
  aws s3 cp "$page" "s3://$BUCKET/$page" --content-type "text/html; charset=utf-8" \
    --cache-control "no-cache" >/dev/null
done
echo "Uploaded site files"

# 3. Origin access control (lets only CloudFront read the bucket)
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${NAME}-oac'].Id | [0]" --output text)
if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=${NAME}-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)
  echo "Created origin access control"
fi

# 4. CloudFront distribution (found again by its comment)
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${TAG}'].Id | [0]" --output text)
if [ "$DIST_ID" = "None" ] || [ -z "$DIST_ID" ]; then
  ORIGIN="${BUCKET}.s3.${REGION}.amazonaws.com"
  CONFIG=$(cat <<JSON
{
  "CallerReference": "${TAG}-$(date +%s)",
  "Comment": "${TAG}",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "PriceClass": "PriceClass_100",
  "HttpVersion": "http2and3",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "s3-site", "DomainName": "${ORIGIN}", "OriginAccessControlId": "${OAC_ID}",
    "S3OriginConfig": { "OriginAccessIdentity": "" } }] },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-site",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
  },
  "CustomErrorResponses": { "Quantity": 1, "Items": [{
    "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 60 }] }
}
JSON
)
  DIST_ID=$(aws cloudfront create-distribution --distribution-config "$CONFIG" \
    --query Distribution.Id --output text)
  echo "Created CloudFront distribution $DIST_ID (takes ~5–15 min to deploy)"
else
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
  echo "Invalidated CloudFront cache for $DIST_ID"
fi

# 5. Bucket policy: only this distribution may read objects
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontRead",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}" } }
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY"

DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.DomainName --output text)
STATUS=$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.Status --output text)
echo "Site: https://${DOMAIN}  (status: ${STATUS})"
