import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const document = JSON.parse(
  await readFile(new URL(import.meta.resolve("@agentclientprotocol/sdk/schema/schema.json")), "utf8"),
);
const definitions = document.$defs;
const directory = new URL("../src/acp/generated/", import.meta.url);
const check = process.argv.includes("--check");
const names = Object.keys(definitions);
const output = new Map();

function refs(value) {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (value === null || typeof value !== "object") return [];
  const own = value.$ref ? [value.$ref.split("/").at(-1)] : [];
  return [...own, ...Object.values(value).flatMap(refs)];
}

function objectFields(value) {
  if (value.$ref) return objectFields(definitions[value.$ref.split("/").at(-1)]);
  if (value.anyOf || value.oneOf || (value.type && value.type !== "object")) return null;
  const fields = { ...value.properties };
  const required = new Set(value.required ?? []);
  for (const part of value.allOf ?? []) {
    const inherited = objectFields(part);
    if (!inherited) return null;
    Object.assign(fields, inherited.fields);
    for (const key of inherited.required) required.add(key);
  }
  return { fields, required };
}

function union(values) {
  return values.length === 1 ? values[0] : `z.union([${values.join(",")}])`;
}

function expression(value, strict) {
  if (value === true) return "z.unknown()";
  if (value === false) return "z.never()";
  if (value.$ref) return `${value.$ref.split("/").at(-1)}${strict ? "Outbound" : ""}Schema`;
  if (Object.hasOwn(value, "const")) return `z.literal(${JSON.stringify(value.const)})`;
  if (value.enum) return `z.enum(${JSON.stringify(value.enum)})`;
  if (Array.isArray(value.type)) {
    return union(value.type.map((type) => expression({ ...value, type }, strict)));
  }
  if (value.anyOf || value.oneOf) return union((value.anyOf ?? value.oneOf).map((part) => expression(part, strict)));
  if (value.allOf && !value.type && value.allOf.length === 1) return expression(value.allOf[0], strict);
  if (value.type === "object" || value.properties) {
    const object = objectFields(value);
    if (!object) throw new Error(`Unsupported object intersection: ${JSON.stringify(value)}`);
    const entries = Object.entries(object.fields).map(([key, field]) => `${JSON.stringify(key)}: ${expression(field, strict)}${object.required.has(key) ? "" : ".optional()"}`);
    let result;
    if (entries.length === 0 && value.additionalProperties) {
      const item = value.additionalProperties === true ? "z.unknown()" : expression(value.additionalProperties, strict);
      result = `z.record(z.string(), ${item})`;
    } else {
      result = `z.${strict && value.additionalProperties !== true && value.unevaluatedProperties !== true ? "strictObject" : "looseObject"}({${entries.join(",")}})`;
      if (value.additionalProperties && value.additionalProperties !== true) result += `.catchall(${expression(value.additionalProperties, strict)})`;
    }
    if (value.not) {
      const excluded = value.not.anyOf.map((part) => Object.entries(part.properties)[0]);
      const key = excluded[0][0];
      if (excluded.some(([tag]) => tag !== key)) throw new Error("Unsupported exclusion");
      result += `.refine((value) => !${JSON.stringify(excluded.map(([, tag]) => tag.const))}.includes(value[${JSON.stringify(key)}]), { message: "Malformed known ACP variant" })`;
    }
    return result;
  }
  if (value.type === "array") {
    let result = `z.array(${expression(value.items ?? true, strict)})`;
    if (value.minItems !== undefined) result += `.min(${value.minItems})`;
    if (value.maxItems !== undefined) result += `.max(${value.maxItems})`;
    return result;
  }
  if (value.type === "null") return "z.null()";
  if (value.type === "boolean") return "z.boolean()";
  if (value.type === "string") {
    let result = "z.string()";
    if (value.minLength !== undefined) result += `.min(${value.minLength})`;
    if (value.maxLength !== undefined) result += `.max(${value.maxLength})`;
    if (value.pattern) result += `.regex(new RegExp(${JSON.stringify(value.pattern)}))`;
    return result;
  }
  if (value.type === "number" || value.type === "integer") {
    let result = value.type === "integer" ? "z.number().refine(Number.isInteger, { message: \"Expected integer\" })" : "z.number()";
    if (value.minimum !== undefined) result += `.check(z.gte(${value.minimum}))`;
    if (value.maximum !== undefined) result += `.check(z.lte(${value.maximum}))`;
    return result;
  }
  if (Object.keys(value).every((key) => (["description", "title", "default"].includes(key) || key.startsWith("x-")))) return "z.unknown()";
  throw new Error(`Unsupported ACP schema: ${JSON.stringify(value)}`);
}

const ordered = [];
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  visited.add(name);
  for (const dependency of refs(definitions[name])) visit(dependency);
  ordered.push(name);
}
for (const name of names) visit(name);

const groupSize = 20;
const groups = Array.from({ length: Math.ceil(ordered.length / groupSize) }, (_, index) => ordered.slice(index * groupSize, (index + 1) * groupSize));
const modules = new Map(groups.flatMap((group, index) => group.map((name) => [name, `schemas-${index}`])));
for (const [index, group] of groups.entries()) {
  const module = `schemas-${index}`;
  const dependencies = new Set(group.flatMap((name) => refs(definitions[name])).filter((name) => !group.includes(name)));
  const imports = [...dependencies].map((name) => `import { ${name}Schema, ${name}OutboundSchema } from "./${modules.get(name)}";`).join("\n");
  const declarations = group.map((name) => `const ${name}Schema = ${expression(definitions[name], false)};\nconst ${name}OutboundSchema = ${expression(definitions[name], true)};\ntype ${name} = z.output<typeof ${name}Schema>;`).join("\n");
  const exports = group.flatMap((name) => [`${name}Schema`, `${name}OutboundSchema`, `type ${name}`]).join(",");
  output.set(`${module}.ts`, `// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.\nimport * as z from "zod";\n${imports}\n${declarations}\nexport {${exports}};\n`);
}
output.set("index.ts", groups.map((_, index) => `export * from "./schemas-${index}";`).join("\n"));
await mkdir(directory, { recursive: true });
for (const [name, source] of output) {
  const target = new URL(name, directory);
  const formatted = await format(source, { parser: "typescript" });
  if (check) {
    if ((await readFile(target, "utf8")) !== formatted) throw new Error(`Regenerate ${fileURLToPath(target)}`);
  } else {
    await writeFile(target, formatted);
  }
}
console.log(`${check ? "Checked" : "Generated"} ${names.length} ACP definitions.`);
