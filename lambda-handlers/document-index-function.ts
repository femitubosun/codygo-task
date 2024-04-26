import { S3Handler } from "aws-lambda";
import * as logUtils from "/opt/logUtils";
import * as docUtils from "/opt/documentUtils";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import { Readable } from "stream";
import { DynamoDBWriteRequest, PutDocumentRequest } from "types";

export const handler: S3Handler = async (event, _context) => {
  try {
    const s3Client = new S3Client();
    const dynamoDbClient = new DynamoDBClient();
    const dbDocClient = DynamoDBDocumentClient.from(dynamoDbClient);

    const record = event.Records[0];
    const bucketName = `${process.env.APP_NAME}-document-storage-${process.env.ENV}`;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    logUtils.logInfo(`Indexing ${key}`);

    const { Body } = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key })
    );

    const CANNOT_PROCESS_TYPE =
      !Body || (!(Body instanceof Readable) && !Buffer.isBuffer(Body));

    if (CANNOT_PROCESS_TYPE) {
      logUtils.logError(`Cannot Process ${key}`);

      return;
    }

    const documentBuffer = await docUtils.convertObjectToBuffer(
      Body as Readable | Buffer
    );

    const rawText = await docUtils.extractRawText(documentBuffer);

    if (!rawText) {
      logUtils.logError(`Something went wrong while indexing ${key}`);

      return;
    }

    const tableName = `${process.env.APP_NAME}-words-cache-${process.env.ENV}`;

    logUtils.logInfo(`Indexing to ${tableName}`);

    const uniqueWords = docUtils.getUniqueWords(rawText.toLowerCase());

    logUtils.logInfo(
      `Attempting to index ${uniqueWords.size} words from ${key}`
    );

    const indexCount = await writeWordsIntoDb({
      words: uniqueWords,
      tableName,
      objectKey: key,
      client: dbDocClient,
    });

    logUtils.logInfo(`${indexCount} words in ${key} indexed successfully`);

    return;
  } catch (error: any) {
    logUtils.logError(error, "Document Index Function");

    throw error;
  }
};

const writeWordsIntoDb = async (
  writeWordsIntoDbParams: DynamoDBWriteRequest
): Promise<number> => {
  const { words, tableName, objectKey, client } = writeWordsIntoDbParams;

  const putCommands: Array<PutDocumentRequest> = [];

  let c = 0;

  for (let word of words) {
    if (word.length === 0) continue;

    const getItemCommand = new GetCommand({
      TableName: tableName,
      Key: {
        word,
      },
    });

    const data = await client.send(getItemCommand);

    if (!data.Item) {
      putCommands.push({
        PutRequest: { Item: { documents: [objectKey], word } },
      });
      continue;
    }

    if (data.Item.documents.includes(objectKey)) continue;

    const updateItemCommand = new UpdateCommand({
      TableName: tableName,
      Key: { word },
      UpdateExpression: "SET documents = list_append(documents, :newDocument)",
      ExpressionAttributeValues: {
        ":newDocument": [objectKey],
      },
    });

    try {
      await client.send(updateItemCommand);
    } catch (err: any) {
      logUtils.logError(
        `Error updating index for '${word}'\n${err}\nSkipping...`
      );
    }

    c++;
  }

  await executeBatchWrite(client, tableName, putCommands);

  return c;
};

const executeBatchWrite = async (
  client: DynamoDBDocumentClient,
  tableName: string,
  putCommands: Array<PutDocumentRequest>
) => {
  const CHUNK_SIZE = 25;

  for (let i = 0; i < putCommands.length; i += CHUNK_SIZE) {
    const chunk = putCommands.slice(i, i + CHUNK_SIZE);

    const batchWriteCommand = new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk,
      },
    });

    try {
      await client.send(batchWriteCommand);
    } catch (err: any) {
      logUtils.logError(err);
      logUtils.logError(`Error indexing chunk.\n${chunk}`);
    }
  }
};
