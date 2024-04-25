export const logInfo = (
  message: string | any,
  title: string | undefined = undefined,
): void => {
  if (typeof message === "string") {
    title ? console.info(`🚀 ${title}: ${message}`) : console.info(message);
  } else {
    title
      ? console.info(`🚀 ${title}:`, JSON.stringify(message, null, 2))
      : console.info(JSON.stringify(message, null, 2));
  }
};

export const logError = (
  message: string | any,
  title: string | undefined = undefined,
): void => {
  if (typeof message === "string") {
    title ? console.error(`❗️️ ${title}: ${message}`) : console.error(message);
  } else {
    title
      ? console.error(`❗️️ ${title}:`, JSON.stringify(message, null, 2))
      : console.error(JSON.stringify(message, null, 2));
  }
};

export const logWarn = (
  message: string | any,
  title: string | undefined = undefined,
): void => {
  if (typeof message === "string") {
    title ? console.warn(`⚠️  ${title}: ${message}`) : console.warn(message);
  } else {
    title
      ? console.warn(`⚠️ ${title}:`, JSON.stringify(message, null, 2))
      : console.warn(JSON.stringify(message, null, 2));
  }
};
export const logDebug = (
  message: string | any,
  title: string | undefined = undefined,
): void => {
  if (process.env.LOG_LEVEL === "debug") {
    if (typeof message === "string") {
      title ? console.debug(`💡 ${title}: ${message}`) : console.debug(message);
    } else {
      title
        ? console.debug(`💡 ${title}:`, JSON.stringify(message, null, 2))
        : console.debug(JSON.stringify(message, null, 2));
    }
  }
};
