import {Readable} from "stream";
import * as utils from "./logUtils";
import mammoth from "mammoth";

export const extractRawText = async (
    buffer: Buffer,
): Promise<string | void> => {
    try {
        const text = await mammoth.extractRawText({buffer});

        return text.value;
    } catch (err) {
        utils.logError(
            "Something went wrong while extracting text from the document",
        );
    }
};

export const getUniqueWords = (text: string): Set<string> => {
    const words = text.split(/\s+/).map(word => word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, ""));

    return new Set(words);
};

export const convertObjectToBuffer = async (
    object: Readable | Buffer,
): Promise<Buffer> => {
    if (Buffer.isBuffer(object)) return object;

    const chunks: Uint8Array[] = [];

    for await (const chunk of object) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};


import * as util from 'util'
import * as stream from 'stream'

export const pipeline = util.promisify(stream.pipeline)
