import { Construct } from "constructs";
import { Stack, StackProps } from "aws-cdk-lib";
import { AppContext, CreateS3PermissionPolicy } from "../types";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamoDb from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";
import { CfnOutput } from "aws-cdk-lib";
import { LambdaDefinition } from "../types";
import * as apiGateWay from "aws-cdk-lib/aws-apigatewayv2";
import { LambdaConfig } from "./lambda-config";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as apiGatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { InvokeMode } from "aws-cdk-lib/aws-lambda";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cwLogs from "aws-cdk-lib/aws-logs";

export class CodygoTaskStack extends Stack {
  private secureGroup: iam.Group;
  private documentStorage: s3.Bucket;
  private wordsCache: dynamoDb.Table;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    context: AppContext
  ) {
    super(scope, id, props);

    this.#createDataContructs(context);
    this.#createLambdaConstructs(context);
  }

  /**
   * Creates data constructs including secure groups, document storage, and words cache.
   * @param {AppContext} context - The context containing configuration for the CDK deployment.
   */
  #createDataContructs(context: AppContext) {
    this.secureGroup = this.#createSecureGroup(context);
    this.documentStorage = this.#createDocumentBucket(context);
    this.wordsCache = this.#createWordsTable(context);

    // Roles and Policies
    const s3CliPutPolicy = this.#createS3Policy({
      bucket: this.documentStorage,
      putPermission: true,
      conditions: {
        StringLike: {
          "aws:UserAgent": "aws-cli/*",
        },
      },
    });

    this.documentStorage.grantRead(this.secureGroup);
    this.secureGroup.addToPolicy(s3CliPutPolicy);
  }

  /**
   * Creates Lambda constructs including HTTP API, roles, policies, and Lambda functions.
   * @param {AppContext} context - The context containing configuration for the CDK deployment.
   */
  #createLambdaConstructs(context: AppContext) {
    // Constructs
    const appApi = new apiGateWay.HttpApi(this, "AppAPI");

    // Roles and policies
    const lambdaRole = this.#createLambdaRole(context);
    const lambdaReadDeletePolicy = this.#createS3Policy({
      bucket: this.documentStorage,
      getPermission: true,
      deletePermission: true,
    });
    const cwGroupPolicy = this.#createCwLogPolicy();

    // Configure Lambda Layer
    const lambdaLayer = this.#createLambdaLayer(context);

    // Define Lambda Functions
    const lambdaDefinitions = LambdaConfig.getLambdaDefinitions(context);
    let downloadApiUrl = "";

    lambdaDefinitions.forEach((lambdaDefinition: LambdaDefinition) => {
      const functionProps = LambdaConfig.getFunctionProps({
        lambdaDefinition,
        lambdaLayer,
        lambdaRole,
        context,
      });

      const logGroup = this.#createLogGroup(lambdaDefinition.name, context);

      const lambdaFunction = new NodejsFunction(
        this,
        `${lambdaDefinition.name}-function`,
        {
          ...functionProps,
          logGroup,
          environment: {
            ...functionProps.environment,
            DOWNLOAD_API_URL: downloadApiUrl,
          },
        }
      );

      const {
        events,
        gateWayConfiguration,
        functionUrlConfiguration,
        wordsTablePermissions,
      } = lambdaDefinition;

      if (events) {
        lambdaFunction.addEventSource(
          new S3EventSource(this.documentStorage, {
            events,
          })
        );
      }

      if (gateWayConfiguration) {
        const lambdaIntegration =
          new apiGatewayv2Integrations.HttpLambdaIntegration(
            `${context.appName}-${lambdaDefinition.name}-integration`,
            lambdaFunction
          );

        for (let config of gateWayConfiguration.urlConfigs) {
          appApi.addRoutes({
            path: `/${config.path}`,
            methods: config.methods,
            integration: lambdaIntegration,
          });

          new CfnOutput(this, `${lambdaDefinition.name}`, {
            value: `Search API URL: ${appApi.url!}search`,
          });
        }
      }

      if (functionUrlConfiguration) {
        const lambdaUrl = lambdaFunction.addFunctionUrl({
          authType: lambda.FunctionUrlAuthType.NONE,
          invokeMode: InvokeMode.RESPONSE_STREAM,
          cors: {
            allowedMethods: [lambda.HttpMethod.GET],
            allowedOrigins: ["*"],
          },
        });

        downloadApiUrl = lambdaUrl.url;

        new CfnOutput(this, `${lambdaDefinition.name} Download API URL:`, {
          value: lambdaUrl.url,
        });
      }

      if (wordsTablePermissions) {
        const { read, write } = wordsTablePermissions;

        if (read) {
          this.wordsCache.grantReadData(lambdaFunction);
        }

        if (write) {
          this.wordsCache.grantWriteData(lambdaFunction);
        }
      }
    });

    lambdaRole.addToPolicy(lambdaReadDeletePolicy);
    lambdaRole.addToPolicy(cwGroupPolicy);
  }

  /**
   * Creates a Lambda role for the application.
   * @param {AppContext} context - The context containing configuration for the CDK deployment.
   * @returns {iam.Role} - The Lambda role created.
   */
  #createLambdaRole(context: AppContext) {
    return new iam.Role(this, "lambdaRole", {
      roleName: `${context.appName}-lambda-role-${context.environment}`,
      description: `Lambda role for ${context.appName}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
      ],
    });
  }

  /**
   * Creates a Lambda Layer for shared code or dependencies.
   * @param context The context containing configuration for the CDK deployment.
   * @returns An instance of the Lambda Layer created.
   */
  #createLambdaLayer(context: AppContext): lambda.LayerVersion {
    return new lambda.LayerVersion(this, "LambdaLayer", {
      code: lambda.Code.fromAsset("lambda-layer"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: `Shared Lambda Layer for ${context.appName}`,
    });
  }

  /**
   * Creates an IAM policy statement for CloudWatch Logs permissions.
   * This policy allows for the creation and management of log groups and log streams,
   * as well as the capability to publish log events to CloudWatch Logs.
   *
   * @returns An IAM PolicyStatement instance with CloudWatch Logs permissions.
   */
  #createCwLogPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:PutLogEvents",
      ],
    });
  }

  /**
   * Creates a CloudWatch Log Group for a specific Lambda function.
   * The log group name is constructed using the Lambda function name, application name, and environment from the context.
   * The logs are retained for one month before being destroyed.
   *
   * @param {string} lambdaName - The name of the Lambda function for which the log group is being created.
   * @param {AppContext} context - The context containing configuration for the CDK deployment, including application name and environment.
   * @returns {cwLogs.LogGroup} The created CloudWatch Log Group instance.
   */
  #createLogGroup(lambdaName: string, context: AppContext): cwLogs.LogGroup {
    return new cwLogs.LogGroup(this, `${lambdaName}-log-group`, {
      logGroupName: `/aws/lambda/${context.appName}-${lambdaName}-${context.environment}`,
      retention: cwLogs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  /**
   * Creates an IAM Group for document uploaders with a specified group name from the context.
   * @param {AppContext} context - The context containing configuration for the CDK deployment.
   * @returns An instance of the IAM Group created.
   */
  #createSecureGroup(context: AppContext) {
    return new iam.Group(this, "documentUploadersGroup", {
      groupName: context.secureGroupName,
    });
  }

  /**
   * Creates an Amazon S3 bucket with optional encryption.
   * @param {AppContext} context - The context containing configuration for the CDK deployment.
   * @returns An instance of the S3 bucket created.
   */
  #createDocumentBucket(context: AppContext) {
    return new s3.Bucket(this, "documentStorage", {
      bucketName: `${context.appName}-document-storage-${context.environment}`,
    });
  }

  /**
   * Creates a DynamoDB table with a partition key on "word".
   * @param context The context containing configuration for the CDK deployment.
   * @returns An instance of the DynamoDB table created.
   */
  #createWordsTable(context: AppContext): dynamoDb.Table {
    return new dynamoDb.Table(this, "wordsCache", {
      tableName: `${context.appName}-words-cache-${context.environment}`,
      partitionKey: {
        name: "word",
        type: dynamoDb.AttributeType.STRING,
      },
    });
  }

  /**
   * Creates an IAM policy statement for S3 bucket permissions.
   * @param {CreateS3PermissionPolicy} params - The parameters for creating the S3 permission policy.
   * @returns An IAM PolicyStatement instance with specified S3 permissions.
   */
  #createS3Policy(params: CreateS3PermissionPolicy): iam.PolicyStatement {
    const {
      bucket,
      conditions = {},
      putPermission = false,
      deletePermission = false,
      getPermission = false,
      effect = iam.Effect.ALLOW,
    } = params;

    const actions = [];

    if (putPermission) actions.push("s3:PutObject");
    if (deletePermission) actions.push("s3:DeleteObject");
    if (getPermission) actions.push("s3:GetObject");

    return new iam.PolicyStatement({
      actions,
      resources: [`${bucket.bucketArn}/*`, bucket.bucketArn],
      conditions,
      effect,
    });
  }
}
