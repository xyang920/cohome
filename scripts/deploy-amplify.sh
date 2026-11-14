#!/usr/bin/env bash
# Deploy the static site to AWS Amplify Hosting with a manual (zip) deployment.
# Idempotent: creates the Amplify app + branch on the first run, then deploys a new zip each run.
#   Usage: AWS_PROFILE=default bash scripts/deploy-amplify.sh
set -euo pipefail

cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-us-east-1}"
APP_NAME="sustainerprice"
BRANCH="main"
ZIP=".amplify-deploy.zip"
export AWS_DEFAULT_REGION="$REGION"

# 1. App (found again by name)
APP_ID=$(aws amplify list-apps --query "apps[?name=='${APP_NAME}'].appId | [0]" --output text)
if [ "$APP_ID" = "None" ] || [ -z "$APP_ID" ]; then
  APP_ID=$(aws amplify create-app --name "$APP_NAME" --platform WEB \
    --description "CoHome hackathon demo (static, manual deploy)" \
    --tags project=sustainerprice-demo --query app.appId --output text)
  echo "Created Amplify app $APP_ID"
fi

# 2. Branch
if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" >/dev/null 2>&1; then
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --stage PRODUCTION >/dev/null
  echo "Created branch $BRANCH"
fi

# 3. Zip the site files only (forward-slash paths, as Amplify expects)
rm -f "$ZIP"
python -I - "$ZIP" <<'PY'
import sys, zipfile, pathlib
out = sys.argv[1]
files = [pathlib.Path(p) for p in ("index.html", "app.html", "site.webmanifest")]
for folder in ("css", "js", "assets/web"):
    files += sorted(p for p in pathlib.Path(folder).rglob("*") if p.is_file())
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f.as_posix())
print(f"Zipped {len(files)} files")
PY

# 4. Cancel any job left pending by an interrupted run, then create, upload and start
for STALE in $(aws amplify list-jobs --app-id "$APP_ID" --branch-name "$BRANCH" \
    --query "jobSummaries[?status=='PENDING'].jobId" --output text | tr -d '\r'); do
  aws amplify stop-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$STALE" >/dev/null
  echo "Cancelled stale job $STALE"
done
DEPLOY=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --query "[jobId, zipUploadUrl]" --output text | tr -d '\r')   # strip Windows CR
JOB_ID="${DEPLOY%%$'\t'*}"
UPLOAD_URL="${DEPLOY#*$'\t'}"
curl -sS --fail -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP" "$UPLOAD_URL" -o /dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
rm -f "$ZIP"
echo "Started deployment job $JOB_ID"

# 5. Wait for the job (up to ~5 minutes)
for _ in $(seq 1 60); do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --query job.summary.status --output text)
  case "$STATUS" in
    SUCCEED) break ;;
    FAILED|CANCELLED) echo "Deployment $STATUS" >&2; exit 1 ;;
  esac
  sleep 5
done
echo "Status: $STATUS"
echo "Site: https://${BRANCH}.${APP_ID}.amplifyapp.com"
