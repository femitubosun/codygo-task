# Codygo Backend Task

## Uploading a Document

`aws s3 cp "./Sample 1MB.docx" s3://femis-codygo-backend-app-document-storage-production/ --profile test_dev`

Where `test_dev` is profile of an IAM user who is a part of the `femi-test-codygo-document-uploaders` group.

## Searching a Document

### Request

`curl -H "x-api-key:CODYGO-123-123" "https://j5nmvyljm8.execute-api.eu-central-1.amazonaws.com/search?words=machine,or"`

### Response

```json
[
  "https://h3bomvuju7xzfugrzd2m262oae0rbnng.lambda-url.eu-central-1.on.aws/?fileName=Day%201.docx",
  "https://h3bomvuju7xzfugrzd2m262oae0rbnng.lambda-url.eu-central-1.on.aws/?fileName=Day%206.docx",
  "https://h3bomvuju7xzfugrzd2m262oae0rbnng.lambda-url.eu-central-1.on.aws/?fileName=Day%205.docx"
]
```

### Download

`curl -o fileName.docx "https://h3bomvuju7xzfugrzd2m262oae0rbnng.lambda-url.eu-central-1.on.aws/?fileName=Day%205.docx"`
