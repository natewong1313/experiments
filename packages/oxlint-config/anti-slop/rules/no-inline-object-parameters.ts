import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "../shared/function-parameters.ts";

type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

/** Return whether a TypeScript type node is or contains an inline object type literal. */
function containsTypeLiteral(type: ESTree.TSType): boolean {
  if (type.type === "TSTypeLiteral") return true;
  if (type.type === "TSParenthesizedType") {
    return containsTypeLiteral(type.typeAnnotation);
  }
  if (type.type === "TSArrayType") {
    return containsTypeLiteral(type.elementType);
  }
  if (type.type === "TSUnionType" || type.type === "TSIntersectionType") {
    return type.types.some(containsTypeLiteral);
  }
  return false;
}

/** Disallow inline object type literals in function parameter annotations. */
export const noInlineObjectParametersRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow inline object type literals on function parameters; extract the shape into a named type and reference it by name.",
    },
    messages: {
      inlineObjectParameter:
        "Parameter `{{parameter}}` uses an inline object type. Extract the shape into a named type (`interface` or `type` alias) and reference it by name.",
    },
  },
  createOnce(context) {
    const checkParameters = (node: ParameterOwner) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === null || annotation === undefined) continue;
        if (!containsTypeLiteral(annotation.typeAnnotation)) continue;
        context.report({
          node: annotation.typeAnnotation,
          messageId: "inlineObjectParameter",
          data: {
            parameter: functionParameterBindingName(
              parameter,
              context.sourceCode,
            ),
          },
        });
      }
    };

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
});
