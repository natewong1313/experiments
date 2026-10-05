import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const isNamed = (property: ESTree.Expression | ESTree.PrivateIdentifier, name: string): boolean => {
  if (property.type === "Identifier") return property.name === name;
  if (property.type === "PrivateIdentifier") return property.name === name;
  if (property.type === "Literal") return property.value === name;
  return false;
};

const objectIsSql = (object: ESTree.Expression | ESTree.Super): boolean => {
  if (object.type === "Identifier") return object.name === "sql";
  if (object.type === "MemberExpression" && !object.computed) {
    return isNamed(object.property, "sql");
  }
  if (object.type === "MemberExpression" && object.computed) {
    return object.property.type === "Literal" && object.property.value === "sql";
  }
  return false;
};

/** Ban direct `sql.exec` calls on Durable Object SQLite storage; queries must go through drizzle. */
export const noDirectSqlExecRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow calling `sql.exec` directly on Durable Object storage; use the drizzle client instead.",
    },
    messages: {
      directSqlExec:
        "Do not call `sql.exec` directly. Use the drizzle client (`drizzle-orm/durable-sqlite`) to run queries.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (!isNamed(callee.property, "exec")) return;
        if (!objectIsSql(callee.object)) return;
        context.report({ node: callee, messageId: "directSqlExec" });
      },
    };
  },
});
