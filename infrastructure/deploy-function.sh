#!/bin/bash

# Deploy Cloud Function for image resizing
# Usage: ./deploy-function.sh

PROJECT_ID=$(gcloud config get-value project)
FUNCTION_NAME="resize-image"
REGION="us-central1"
RUNTIME="python313"
ENTRY_POINT="resize_image"
TRIGGER_BUCKET="image-resize-bucket-492619"
MEMORY="512MB"
TIMEOUT="300s"

echo "Deploying Cloud Function: $FUNCTION_NAME"
echo "Project: $PROJECT_ID"
echo "Trigger Bucket: $TRIGGER_BUCKET"

gcloud functions deploy $FUNCTION_NAME \
    --project=$PROJECT_ID \
    --region=$REGION \
    --runtime=$RUNTIME \
    --trigger-resource=$TRIGGER_BUCKET \
    --trigger-event=google.storage.object.finalize \
    --entry-point=$ENTRY_POINT \
    --memory=$MEMORY \
    --timeout=$TIMEOUT \
    --set-env-vars="RESIZED_BUCKET=your-resized-bucket-name,TARGET_SIZES=640,1024,IMAGE_QUALITY=80,MAX_WORKERS=3,MAX_FILE_SIZE=10485760" \
    --source=../backend/function

echo "Deployment complete!"