import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import * as z from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

const document = JSON.parse(
  await readFile(
    new URL(import.meta.resolve("@agentclientprotocol/sdk/schema/schema.json")),
    "utf8",
  ),
);

const definitions = document.$defs;

const directory = new URL("../src/acp/generated/", import.meta.url);

const check = process.argv.includes("--check");

const names = Object.keys(definitions);

const output = new Map();

function refs(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => refs(item));
  }

  if (!JsonObjectSchema.safeParse(value).success) {
    return [];
  }

  const own = value.$ref ? [value.$ref.split("/").at(-1)] : [];

  return [...own, ...Object.values(value).flatMap((item) => refs(item))];
}

function objectVariants(value) {
  if (value.$ref) {
    return objectVariants(definitions[value.$ref.split("/").at(-1)]);
  }

  if (value.type && value.type !== "object") {
    return null;
  }

  let variants = [
    {
      properties: { ...value.properties },
      required: [...(value.required ?? [])],
      additionalProperties: value.additionalProperties,
      unevaluatedProperties: value.unevaluatedProperties,
      not: value.not,
    },
  ];

  const parts = [...(value.allOf ?? [])];

  if (value.anyOf || value.oneOf) {
    parts.push({ alternatives: value.anyOf ?? value.oneOf });
  }

  for (const part of parts) {
    const inherited = part.alternatives
      ? part.alternatives.flatMap((item) => objectVariants(item) ?? [])
      : objectVariants(part);

    if (!inherited?.length) {
      return null;
    }

    variants = variants.flatMap((own) =>
      inherited.map((base) => ({
        ...base,
        ...own,
        additionalProperties: own.additionalProperties ?? base.additionalProperties,
        unevaluatedProperties: own.unevaluatedProperties ?? base.unevaluatedProperties,
        not: own.not ?? base.not,
        properties: { ...base.properties, ...own.properties },
        required: [...new Set([...base.required, ...own.required])],
      })),
    );
  }

  return variants;
}

function union(values) {
  const literals = values.map((value) =>
    /^z\.literal\(".*"\)$/.test(value) ? JSON.parse(value.slice(10, -1)) : null,
  );

  if (literals.every((value) => value !== null)) {
    return `z.enum(${JSON.stringify(literals)})`;
  }

  return values.length === 1 ? values[0] : `z.union([${values.join(",")}])`;
}

function expression(value, strict) {
  if (value === true) {
    return "z.unknown()";
  }

  if (value === false) {
    return "z.never()";
  }

  if (value.$ref) {
    return `${value.$ref.split("/").at(-1)}${strict ? "Outbound" : ""}Schema`;
  }

  if (Object.hasOwn(value, "const")) {
    return `z.literal(${JSON.stringify(value.const)})`;
  }

  if (value.enum) {
    return `z.enum(${JSON.stringify(value.enum)})`;
  }

  if (Array.isArray(value.type)) {
    return union(value.type.map((type) => expression({ ...value, type }, strict)));
  }

  if ((value.anyOf || value.oneOf) && !value.properties) {
    return union((value.anyOf ?? value.oneOf).map((part) => expression(part, strict)));
  }

  if (value.allOf && !value.type && value.allOf.length === 1) {
    return expression(value.allOf[0], strict);
  }

  if (value.type === "object" || value.properties) {
    if (value.allOf || value.anyOf || value.oneOf) {
      const variants = objectVariants(value);

      if (!variants) {
        throw new Error(`Unsupported object intersection: ${JSON.stringify(value)}`);
      }

      return union(variants.map((variant) => expression({ ...variant, type: "object" }, strict)));
    }

    const entries = Object.entries(value.properties ?? {}).map(
      ([key, field]) =>
        `${JSON.stringify(key)}: ${expression(field, strict)}${value.required?.includes(key) ? "" : ".optional()"}`,
    );

    let result;

    if (entries.length === 0 && value.additionalProperties) {
      const item =
        value.additionalProperties === true
          ? "z.unknown()"
          : expression(value.additionalProperties, strict);

      result = `z.record(z.string(), ${item})`;
    } else {
      result = `z.${strict && value.additionalProperties !== true && value.unevaluatedProperties !== true ? "strictObject" : "looseObject"}({${entries.join(",")}})`;

      if (value.additionalProperties && value.additionalProperties !== true) {
        result += `.catchall(${expression(value.additionalProperties, strict)})`;
      }
    }

    if (value.not) {
      const excluded = value.not.anyOf.map((part) => Object.entries(part.properties)[0]);
      const [[key]] = excluded;

      if (excluded.some(([tag]) => tag !== key)) {
        throw new Error("Unsupported exclusion");
      }

      result += `.refine((value) => !${JSON.stringify(excluded.map(([, tag]) => tag.const))}.includes(value[${JSON.stringify(key)}]), { error: "Malformed known ACP variant" })`;
    }

    return result;
  }

  if (value.type === "array") {
    let result = `z.array(${expression(value.items ?? true, strict)})`;

    if (value.minItems !== void 0) {
      result += `.min(${value.minItems})`;
    }

    if (value.maxItems !== void 0) {
      result += `.max(${value.maxItems})`;
    }

    return result;
  }

  if (value.type === "null") {
    return "z.null()";
  }

  if (value.type === "boolean") {
    return "z.boolean()";
  }

  if (value.type === "string") {
    let result = "z.string()";

    if (value.minLength !== void 0) {
      result += `.min(${value.minLength})`;
    }

    if (value.maxLength !== void 0) {
      result += `.max(${value.maxLength})`;
    }

    if (value.pattern) {
      result += `.regex(new RegExp(${JSON.stringify(value.pattern)}))`;
    }

    return result;
  }

  if (value.type === "number" || value.type === "integer") {
    let result =
      value.type === "integer"
        ? 'z.number().refine(Number.isInteger, { error: "Expected integer" })'
        : "z.number()";

    if (value.minimum !== void 0) {
      result += `.check(z.gte(${value.minimum}))`;
    }

    if (value.maximum !== void 0) {
      result += `.check(z.lte(${value.maximum}))`;
    }

    return result;
  }

  if (
    Object.keys(value).every(
      (key) => ["description", "title", "default"].includes(key) || key.startsWith("x-"),
    )
  ) {
    return "z.unknown()";
  }

  throw new Error(`Unsupported ACP schema: ${JSON.stringify(value)}`);
}

const ordered = [];

const visited = new Set();

function visit(name) {
  if (visited.has(name)) {
    return;
  }

  visited.add(name);

  for (const dependency of refs(definitions[name])) {
    visit(dependency);
  }

  ordered.push(name);
}

for (const name of names) {
  visit(name);
}

const groupSize = 20;

const groups = Array.from({ length: Math.ceil(ordered.length / groupSize) }, (_, index) =>
  ordered.slice(index * groupSize, (index + 1) * groupSize),
);

const modules = new Map(
  groups.flatMap((group, index) => group.map((name) => [name, `schemas-${index}`])),
);

for (const [index, group] of groups.entries()) {
  const module = `schemas-${index}`;

  const declarations = group
    .map(
      (name) =>
        `const ${name}Schema = ${expression(definitions[name], false)};\n\nconst ${name}OutboundSchema = ${expression(definitions[name], true)};\n\ntype ${name} = z.output<typeof ${name}Schema>;`,
    )
    .join("\n\n");

  const dependencies = names.filter(
    (name) =>
      !group.includes(name) && new RegExp(`\\b${name}(?:Outbound)?Schema\\b`).test(declarations),
  );

  const imports = [...new Set(dependencies.map((name) => modules.get(name)))]
    .map(
      (dependency) =>
        `import { ${dependencies
          .filter((name) => modules.get(name) === dependency)
          .flatMap((name) => [`${name}Schema`, `${name}OutboundSchema`])
          .join(",")} } from "./${dependency}";`,
    )
    .join("\n");

  const exports = group
    .flatMap((name) => [`${name}Schema`, `${name}OutboundSchema`, `type ${name}`])
    .join(",");

  output.set(
    `${module}.ts`,
    `// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.\nimport * as z from "zod";\n${imports}\n\n${declarations}\n\nexport {${exports}};\n`,
  );
}

output.set(
  "index.ts",
  groups.map((_, index) => `export * from "./schemas-${index}";`).join("\n\n"),
);

const envelopeNames = new Set([
  "AgentRequest",
  "AgentResponse",
  "AgentNotification",
  "ClientRequest",
  "ClientResponse",
  "ClientNotification",
]);

output.set(
  "drift.ts",
  `import type * as Upstream from "@agentclientprotocol/sdk";\nimport type * as Generated from "./index";\nimport type { Drift, Expect } from "../drift";\n\ntype _AcpDrift = [${names
    .filter((name) => !envelopeNames.has(name))
    .map(
      (name) =>
        `Expect<Drift<Upstream.${name}, Generated.${name}>>, Expect<Drift<Generated.${name}, Upstream.${name}>>`,
    )
    .join(",")}];`,
);

await mkdir(directory, { recursive: true });

await Promise.all(
  [...output].map(async ([name, source]) => {
    const target = new URL(name, directory);
    const initial = await format(name, source);
    const { code: formatted, errors } = await format(name, initial.code);

    if (errors.length > 0) {
      throw new Error(
        `Failed to format ${name}: ${errors.map((error) => error.message).join("; ")}`,
      );
    }

    if (check) {
      if ((await readFile(target, "utf8")) !== formatted) {
        throw new Error(`Regenerate ${fileURLToPath(target)}`);
      }
    } else {
      await writeFile(target, formatted);
    }
  }),
);

console.log(`${check ? "Checked" : "Generated"} ${names.length} ACP definitions.`);
