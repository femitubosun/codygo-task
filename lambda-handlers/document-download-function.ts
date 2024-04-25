import * as logUtils from "/opt/logUtils";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const handler = awslambda.streamifyResponse(
  async (event, responseStream, _context) => {
    try {
      const s3Client = new S3Client();
      const bucketName = `${process.env.APP_NAME}-${process.env.ENV}`;
      const fileName = event.queryStringParameters?.fileName;

      if (!fileName) {
        responseStream.write(`ERROR:File name is missing"`);

        return {
          statusCode: 404,
          body: "File not found!",
        };
      }
      const objectKey = decodeURIComponent(fileName.replace(/\+/g, " "));

      logUtils.logInfo(`${objectKey} Downloading... ${objectKey}`);

      if (!bucketName || !objectKey) {
        return {
          statusCode: 404,
          body: "File not found!",
        };
      }
      const { Body } = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: objectKey })
      );

      const CANNOT_PROCESS_TYPE =
        !Body || (!(Body instanceof Readable) && !Buffer.isBuffer(Body));

      if (CANNOT_PROCESS_TYPE) {
        logUtils.logError(`Cannot Process ${objectKey}`);

        return {
          statusCode: 404,
          body: "File not found!",
        };
      }

      responseStream.setContentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      const requestStream = Readable.from(Body);

      logUtils.logInfo(requestStream);

      await pipeline(requestStream, responseStream);

      return { statusCode: 200 };
    } catch (error: any) {
      logUtils.logError(error.toString());
      responseStream.end();

      return {
        statusCode: 500,
      };
    }
  }
);
