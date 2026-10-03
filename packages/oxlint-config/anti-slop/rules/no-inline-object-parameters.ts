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

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

function isNode(value: unknown): value is ESTree.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

/** Return the first inline object type literal within a type annotation subtree. */
function findTypeLiteral(node: ESTree.Node, keys: VisitorKeys): ESTree.TSTypeLiteral | null {
  if (node.type === "TSTypeLiteral") return node;
  for (const key of keys[node.type] ?? []) {
    const value: unknown = (node as Record<string, unknown>)[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!isNode(child)) continue;
      const found = findTypeLiteral(child, keys);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Return a statically derivable owner name for a function-like node, if any. */
function ownerName(node: ParameterOwner): string | null {
  if (node.type === "TSMethodSignature") {
    return node.key.type === "Identifier" ? node.key.name : null;
  }
  if (node.type === "ArrowFunctionExpression") {
    const parent = node.parent;
    if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
      return parent.id.name;
    }
    if (
      parent.type === "Property" ||
      parent.type === "PropertyDefinition" ||
      parent.type === "MethodDefinition"
    ) {
      return parent.computed === true || parent.key.type !== "Identifier" ? null : parent.key.name;
    }
    return null;
  }
  return node.id?.name ?? null;
}

/** Return the `*Params` type name suggested for an owner, or a placeholder. */
function suggestedParamsName(node: ParameterOwner): string {
  const name = ownerName(node);
  if (name === null) return "…Params";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}Params`;
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
        "Parameter `{{parameter}}` uses an inline object type. Extract the shape into a named `*Params` type (for example `{{suggested}}`) and reference it by name.",
    },
  },
  createOnce(context) {
    const checkParameters = (node: ParameterOwner) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === null || annotation === undefined) continue;
        const typeLiteral = findTypeLiteral(
          annotation.typeAnnotation,
          context.sourceCode.visitorKeys,
        );
        if (typeLiteral === null) continue;
        context.report({
          node: typeLiteral,
          messageId: "inlineObjectParameter",
          data: {
            parameter: functionParameterBindingName(parameter, context.sourceCode),
            suggested: suggestedParamsName(node),
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
