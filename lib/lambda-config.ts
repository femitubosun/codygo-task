import {AppContext, GetFunctionPropsParams, LambdaDefinition} from "../types";
import {NodejsFunctionProps} from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apiGatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import {Duration} from "aws-cdk-lib";

// Constants

export class LambdaConfig {
    private static DEFAULT_LAMBDA_MEMORY_MB = 1024;
    private static DEFAULT_LAMBDA_TIMEOUT_MINUTES = 1;

    public static getLambdaDefinitions(
        context: AppContext,
    ): Array<LambdaDefinition> {
        return [
            {
                name: "document-index-function",
                environment: {
                    REGION: context.region,
                    ENV: context.environment,
                    GIT_BRANCH: context.branchName,
                    APP_NAME: context.appName,
                },
                timeoutMins: 5,
                events: [s3.EventType.OBJECT_CREATED],
                wordsTablePermissions: {
                    read: true,
                    write: true,
                },
            },
            {
                name: "document-download-function",
                environment: {
                    REGION: context.region,
                    ENV: context.environment,
                    GIT_BRANCH: context.branchName,
                    APP_NAME: context.appName,
                },
                functionUrlConfiguration: {
                    methods: [lambda.HttpMethod.GET],
                    origins: ["*"]
                },
            },
            {
                name: "words-search-function",
                environment: {
                    REGION: context.region,
                    ENV: context.environment,
                    GIT_BRANCH: context.branchName,
                    APP_NAME: context.appName,
                    API_KEY: context.apiKey
                },
                gateWayConfiguration: {
                    urlConfigs: [
                        {
                            path: "search",
                            methods: [apiGatewayv2.HttpMethod.GET],
                        },
                    ],
                },
                wordsTablePermissions: {
                    read: true,
                },
            },

        ];
    }

    public static getFunctionProps(
        params: GetFunctionPropsParams,
    ): NodejsFunctionProps {
        const {lambdaDefinition, lambdaRole, lambdaLayer, context} = params;

        return {
            functionName: `${context.appName}-${lambdaDefinition.name}-${context.environment}`,
            entry: `lambda-handlers/${lambdaDefinition.name}.ts`,
            runtime: lambda.Runtime.NODEJS_18_X,
            memorySize: lambdaDefinition.memoryMB ?? this.DEFAULT_LAMBDA_MEMORY_MB,
            timeout: Duration.minutes(
                lambdaDefinition.timeoutMins ?? this.DEFAULT_LAMBDA_TIMEOUT_MINUTES,
            ),
            environment: lambdaDefinition.environment,
            role: lambdaRole,
            layers: [lambdaLayer],
        };
    }
}
