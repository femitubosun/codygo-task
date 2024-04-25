import { Handler } from "aws-lambda";
import * as logUtils from "/opt/logUtils";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export const handler: Handler = async (event, _context) => {
  try {
    const dynamoDbClient = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

    const tableName = `${process.env.APP_NAME}-words-cache-${process.env.ENV}`;
    const downloadUrl = process.env.DOWNLOAD_API_URL;
    const apiKey = process.env.API_KEY;

    const requestApiKey = event.headers["x-api-key"] ?? "";

    if (requestApiKey !== apiKey) {
      return { statusCode: 402, body: "Unauthorized" };
    }

    logUtils.logInfo(`Table in view ${tableName}`);

    let query = event.queryStringParameters?.words;

    if (!query) {
      return { statusCode: 400, body: "Missing query parameter: words" };
    }

    const words = query.split(",");

    const referenceDocs = await getValidWordReferences({
      words,
      tableName,
      docClient,
    });

    const arr = Array.from(referenceDocs).map(
      (doc) => `${downloadUrl}${encodeURIComponent(doc)}`
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(arr),
    };
  } catch (error: any) {
    logUtils.logError(error.toString(), "API Error");

    return { statusCode: 500 };
  }
};

const getValidWordReferences = async (options: {
  words: Array<string>;
  docClient: DynamoDBDocumentClient;
  tableName: string;
}) => {
  const { words, docClient, tableName } = options;
  const documents: Array<string> = [];

  for (let word of words) {
    try {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            word,
          },
        })
      );

      if (!Item) continue;
      documents.push(...Item.documents);
    } catch (err: any) {
      logUtils.logError(err);
    }
  }

  return new Set(documents);
};
