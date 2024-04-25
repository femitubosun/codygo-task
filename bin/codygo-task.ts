#!/usr/bin/env node
import "source-map-support/register";
import { App, StackProps } from "aws-cdk-lib";
import { AppContext } from "../types";
import gitBranch from "git-branch";

import { CodygoTaskStack } from "../lib/codygo-task-stack";
import * as logUtils from "../lambda-layer/logUtils";

class CodygoBackendTaskApp {
  constructor() {
    this.#createStacks();
  }

  async #getContext(app: App): Promise<AppContext> {
    try {
      const currentBranch = await gitBranch();
      console.log(`Current git branch: ${currentBranch}`);

      const environments = app.node.tryGetContext("environments") as any[];
      const environment = environments.find(
        (e: any) => e.branchName === currentBranch
      );

      console.log("Environment:");
      console.log(JSON.stringify(environment, null, 2));

      const globals = app.node.tryGetContext("globals");

      console.log("Globals:");
      console.log(JSON.stringify(globals, null, 2));

      return { ...globals, ...environment };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async #createStacks() {
    try {
      const app = new App();
      const context = await this.#getContext(app);

      const tags: { Environment: string } = {
        Environment: context.environment,
      };

      const stackProps: StackProps = {
        env: {
          region: context.region,
          account: context.accountId,
        },
        tags,
        stackName: `${context.appName}-stack-${context.environment}`,
        description: "Codygo backend task",
      };

      const dataStack = new CodygoTaskStack(
        app,
        `${context.appName}-data-stack-${context.environment}`,
        stackProps,
        context
      );
    } catch (err) {
      logUtils.logError(err);
    }
  }
}

new CodygoBackendTaskApp();
