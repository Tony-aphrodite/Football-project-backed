/**
 * Provider tokens for the DynamoDB module. Lives in its own file so the
 * service and the module can import it without a circular dependency
 * (dynamodb.service ↔ dynamodb.module).
 */
export const DYNAMO_DOC_CLIENT = Symbol('DYNAMO_DOC_CLIENT');
